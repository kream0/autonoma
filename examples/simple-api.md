# Simple REST API

## Overview
Build a simple REST API for managing a todo list.

## Features

### User Management
- User registration with email/password
- Login with JWT tokens
- Password reset functionality

### Todo Operations
- Create, read, update, delete todos
- Mark todos as complete/incomplete
- Filter todos by status
- Sort by creation date or due date

### Data Model
```
User:
  - id: UUID
  - email: string (unique)
  - password_hash: string
  - created_at: timestamp

Todo:
  - id: UUID
  - user_id: UUID (foreign key)
  - title: string
  - description: text (optional)
  - completed: boolean
  - due_date: timestamp (optional)
  - created_at: timestamp
  - updated_at: timestamp
```

## Technical Requirements

### Stack
- Node.js with Express
- TypeScript
- PostgreSQL database
- Prisma ORM
- Jest for testing

### API Endpoints
```
POST   /auth/register    - Register new user
POST   /auth/login       - Login and get JWT
POST   /auth/reset       - Request password reset

GET    /todos            - List all todos (authenticated)
POST   /todos            - Create todo
GET    /todos/:id        - Get single todo
PUT    /todos/:id        - Update todo
DELETE /todos/:id        - Delete todo
```

### Non-functional Requirements
- Input validation on all endpoints
- Proper error handling with consistent error format
- Rate limiting on auth endpoints
- API documentation with OpenAPI/Swagger
- 80%+ test coverage

## Success Criteria
1. All endpoints functional and tested
2. Authentication working with JWT
3. Database migrations set up
4. API docs generated
5. Clean git history with conventional commits
