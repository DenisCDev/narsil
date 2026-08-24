# Narsil v2 — Example

## Structure

```
examples/
  backend/         # Standalone Narsil backend (port 3001)
  frontend/        # Next.js frontend (port 3000)
```

## Quick Start

### 1. Start the backend

```bash
cd backend
export DATABASE_URL="postgres://..."
npm install
npm run dev
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 3. Test the API

```bash
# List users
curl http://localhost:3001/api/users

# Create user
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'

# Get user
curl http://localhost:3001/api/users/<id>

# Update user
curl -X PATCH http://localhost:3001/api/users/<id> \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane"}'

# Delete user
curl -X DELETE http://localhost:3001/api/users/<id>
```

## API Routes (auto-generated)

```
GET     /api/users        — List all users
GET     /api/users/:id    — Get user by ID
POST    /api/users        — Create user
PATCH   /api/users/:id    — Update user
DELETE  /api/users/:id    — Delete user
GET     /api/posts        — List all posts
GET     /api/posts/:id    — Get post by ID
POST    /api/posts        — Create post
PATCH   /api/posts/:id    — Update post
DELETE  /api/posts/:id    — Delete post
```
