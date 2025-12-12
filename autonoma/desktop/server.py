"""WebSocket server for Autonoma desktop integration."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:
    websockets = None  # type: ignore
    WebSocketServerProtocol = Any  # type: ignore

from autonoma.core.config import Config
from autonoma.core.orchestrator import Orchestrator, OrchestratorEvent
from autonoma.core.state import StateManager


logger = logging.getLogger(__name__)


class DesktopServer:
    """WebSocket server for desktop application communication."""

    def __init__(self, port: int = 8765):
        """Initialize the server."""
        self.port = port
        self.clients: set[WebSocketServerProtocol] = set()
        self.config: Config | None = None
        self.state_manager: StateManager | None = None
        self.orchestrator: Orchestrator | None = None
        self._server: Any = None

    async def start(self) -> None:
        """Start the WebSocket server."""
        if websockets is None:
            raise ImportError("websockets package required for desktop server")

        self._server = await websockets.serve(
            self._handle_client,
            "localhost",
            self.port,
        )

        print(f"Server started on ws://localhost:{self.port}")
        logger.info(f"Desktop server started on port {self.port}")

    async def stop(self) -> None:
        """Stop the server."""
        if self._server:
            self._server.close()
            await self._server.wait_closed()

        for client in self.clients:
            await client.close()

        if self.orchestrator:
            await self.orchestrator.shutdown()

        if self.state_manager:
            await self.state_manager.close()

    async def _handle_client(
        self, websocket: WebSocketServerProtocol, path: str
    ) -> None:
        """Handle a client connection."""
        self.clients.add(websocket)
        logger.info(f"Client connected: {websocket.remote_address}")

        try:
            async for message in websocket:
                await self._process_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            logger.info(f"Client disconnected: {websocket.remote_address}")

    async def _process_message(
        self, websocket: WebSocketServerProtocol, message: str
    ) -> None:
        """Process an incoming message."""
        try:
            data = json.loads(message)
            action = data.get("action")

            if action == "init":
                await self._handle_init(websocket, data)
            elif action == "start":
                await self._handle_start(websocket, data)
            elif action == "pause":
                await self._handle_pause(websocket)
            elif action == "resume":
                await self._handle_resume(websocket)
            elif action == "status":
                await self._handle_status(websocket)
            elif action == "logs":
                await self._handle_logs(websocket, data)
            else:
                await self._send(websocket, {"error": f"Unknown action: {action}"})

        except json.JSONDecodeError:
            await self._send(websocket, {"error": "Invalid JSON"})
        except Exception as e:
            logger.error(f"Message processing error: {e}")
            await self._send(websocket, {"error": str(e)})

    async def _handle_init(
        self, websocket: WebSocketServerProtocol, data: dict[str, Any]
    ) -> None:
        """Initialize the orchestrator for a project."""
        project_root = Path(data.get("project_root", "."))

        self.config = Config(project_root=project_root)
        self.config.ensure_dirs()

        self.state_manager = StateManager(self.config.state_db_path)
        await self.state_manager.connect()

        self.orchestrator = Orchestrator(
            self.config,
            self.state_manager,
            on_event=self._on_orchestrator_event,
        )
        await self.orchestrator.initialize()

        await self._send(websocket, {
            "action": "init",
            "success": True,
            "project_root": str(project_root),
        })

    async def _handle_start(
        self, websocket: WebSocketServerProtocol, data: dict[str, Any]
    ) -> None:
        """Start orchestration."""
        if not self.orchestrator:
            await self._send(websocket, {"error": "Not initialized"})
            return

        requirements = data.get("requirements", "")
        requirements_path = data.get("requirements_path")

        if requirements_path:
            req_path = Path(requirements_path)
            if req_path.exists():
                requirements = req_path.read_text()

        if not requirements:
            await self._send(websocket, {"error": "No requirements provided"})
            return

        # Start orchestration in background
        asyncio.create_task(self._run_orchestration(requirements))

        await self._send(websocket, {
            "action": "start",
            "success": True,
        })

    async def _run_orchestration(self, requirements: str) -> None:
        """Run orchestration and broadcast events."""
        try:
            assert self.orchestrator is not None
            result = await self.orchestrator.run(requirements)
            await self._broadcast({
                "event": "completed",
                "result": result,
            })
        except Exception as e:
            logger.error(f"Orchestration error: {e}")
            await self._broadcast({
                "event": "error",
                "error": str(e),
            })

    async def _handle_pause(self, websocket: WebSocketServerProtocol) -> None:
        """Pause orchestration."""
        if self.orchestrator:
            await self.orchestrator.pause()
            await self._send(websocket, {"action": "pause", "success": True})
        else:
            await self._send(websocket, {"error": "Not initialized"})

    async def _handle_resume(self, websocket: WebSocketServerProtocol) -> None:
        """Resume orchestration."""
        if self.orchestrator:
            await self.orchestrator.resume()
            await self._send(websocket, {"action": "resume", "success": True})
        else:
            await self._send(websocket, {"error": "Not initialized"})

    async def _handle_status(self, websocket: WebSocketServerProtocol) -> None:
        """Get current status."""
        if not self.state_manager:
            await self._send(websocket, {"error": "Not initialized"})
            return

        stats = await self.state_manager.get_statistics()
        agents = await self.state_manager.get_all_agents()
        tasks = await self.state_manager.get_all_tasks()

        await self._send(websocket, {
            "action": "status",
            "state": self.orchestrator.state.value if self.orchestrator else "IDLE",
            "statistics": stats,
            "agents": [
                {
                    "id": a.agent_id,
                    "type": a.agent_type,
                    "status": a.status.value,
                    "task": a.current_task_id,
                    "tokens": a.token_usage,
                }
                for a in agents
            ],
            "tasks": [
                {
                    "id": t.task_id,
                    "description": t.description,
                    "status": t.status.value,
                    "agent": t.agent_id,
                    "retries": t.retry_count,
                }
                for t in tasks
            ],
        })

    async def _handle_logs(
        self, websocket: WebSocketServerProtocol, data: dict[str, Any]
    ) -> None:
        """Get logs."""
        if not self.state_manager:
            await self._send(websocket, {"error": "Not initialized"})
            return

        limit = data.get("limit", 50)
        agent_id = data.get("agent_id")

        logs = await self.state_manager.get_logs(agent_id=agent_id, limit=limit)

        await self._send(websocket, {
            "action": "logs",
            "logs": logs,
        })

    def _on_orchestrator_event(
        self, event: OrchestratorEvent, data: dict[str, Any]
    ) -> None:
        """Handle orchestrator events and broadcast to clients."""
        asyncio.create_task(self._broadcast({
            "event": event.value,
            "data": data,
        }))

    async def _send(
        self, websocket: WebSocketServerProtocol, data: dict[str, Any]
    ) -> None:
        """Send a message to a client."""
        try:
            await websocket.send(json.dumps(data))
        except Exception as e:
            logger.error(f"Send error: {e}")

    async def _broadcast(self, data: dict[str, Any]) -> None:
        """Broadcast a message to all clients."""
        message = json.dumps(data)
        for client in self.clients:
            try:
                await client.send(message)
            except Exception as e:
                logger.error(f"Broadcast error: {e}")


async def main() -> None:
    """Main entry point for desktop server."""
    logging.basicConfig(level=logging.INFO)

    port = int(os.environ.get("AUTONOMA_DESKTOP_PORT", "8765"))
    server = DesktopServer(port=port)

    await server.start()

    try:
        # Keep running until interrupted
        await asyncio.Future()
    except asyncio.CancelledError:
        pass
    finally:
        await server.stop()


if __name__ == "__main__":
    asyncio.run(main())
