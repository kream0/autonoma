/**
 * Human Queue Types
 *
 * Types for queuing blockers, questions, and approval requests for human resolution.
 */

export type HumanQueueMessageType = 'question' | 'approval' | 'blocker';
export type HumanQueuePriority = 'low' | 'medium' | 'high' | 'critical';
export type HumanQueueStatus = 'pending' | 'responded' | 'expired';

export interface HumanQueueMessage {
  id: string;
  type: HumanQueueMessageType;
  taskId?: string;
  agentId: string;
  content: string;
  priority: HumanQueuePriority;
  blocking: boolean;
  response?: string;
  status: HumanQueueStatus;
  createdAt: string;
  respondedAt?: string;
}

export interface HumanQueueFilter {
  status?: HumanQueueStatus;
  type?: HumanQueueMessageType;
  taskId?: string;
  blocking?: boolean;
}
