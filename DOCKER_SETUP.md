# Docker Setup Guide for INoteBook

This guide will help you run the INoteBook application using Docker and Docker Compose.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)

## Quick Start

1. **Clone the repository** (if not already done):
   ```bash
   git clone https://github.com/sanchit339/INoteBook-Deploy.git
   cd INoteBook-Deploy
   ```

2. **Build and start all services**:
   ```bash
   docker-compose up --build
   ```

   This will:
   - Start MongoDB on port 27017
   - Build and start the backend on port 4001
   - Build and start the frontend on port 3000

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:4001

4. **Stop the application**:
   ```bash
   docker-compose down
   ```

## Environment Variables

The application uses the following environment variables (configured in `.env`):

### Backend
- `MONGO_URI`: MongoDB connection string (default: `mongodb://mongo:27017/inotebook`)
- `PORT`: Backend server port (default: `4001`)
- `JWT_SECRET`: Secret key for JWT tokens (change in production!)

### Frontend
- `REACT_APP_BACKEND_URL`: Backend API URL (default: `http://localhost:4001`)

## Docker Services

### MongoDB (`mongo`)
- **Image**: mongo:latest
- **Port**: 27017
- **Data**: Persisted in Docker volume `mongo-data`

### Backend (`backend`)
- **Build**: ./backend/Dockerfile
- **Port**: 4001
- **Depends on**: MongoDB

### Frontend (`frontend`)
- **Build**: ./Frontend/Dockerfile
- **Port**: 3000 (mapped from container port 80)
- **Depends on**: Backend

## Common Commands

```bash
# Start services in detached mode (background)
docker-compose up -d

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f backend

# Rebuild a specific service
docker-compose up --build backend

# Stop and remove containers, networks
docker-compose down

# Stop and remove everything including volumes (⚠️ deletes database)
docker-compose down -v

# List running containers
docker-compose ps
```

## Troubleshooting

### Port already in use
If you get an error about ports being in use, either stop the conflicting service or change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "3001:80"  # Change 3000 to 3001
```

### Cannot connect to backend
Make sure:
1. All containers are running: `docker-compose ps`
2. Backend has started successfully: `docker-compose logs backend`
3. MongoDB is connected: Look for "Connected to MongoDB successfully" in backend logs

### Database not persisting
Data is stored in a Docker volume. To check volumes:
```bash
docker volume ls
docker volume inspect inotebook-deploy_mongo-data
```

### Fresh start
To completely reset everything:
```bash
docker-compose down -v
docker-compose up --build
```

## Development Tips

- The backend uses `node index.js` (not nodemon) in Docker for stability
- Frontend is built once during image creation for better performance
- To make code changes, rebuild the affected service: `docker-compose up --build <service-name>`
