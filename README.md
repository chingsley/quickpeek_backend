# QuickPeek

QuickPeek is a location-based service that allows users to check the availability, queue length, and whether a vendor is open for business without leaving home. Users can post questions about vendors in their vicinity, and other users nearby can respond to these questions, earning rewards for providing accurate and timely information. The app includes features like real-time information sharing, user ratings, and notifications based on location.

## Table of Contents

- [Features](#features)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Setup and Running in Development](#setup-and-running-in-development)
- [Running in Production](#running-in-production)

---

## Features

- **Real-time Information:** Users can ask and respond to questions about the current state of vendors (availability, queue length, open/closed status).
- **Rewards for Responders:** Users who provide timely and accurate answers receive rewards.
- **Push Notifications:** Location-based notifications alert users when there's relevant activity near them.
- **User Ratings:** Questioners can rate the quality of responses they receive, helping to maintain the integrity of information.

---

## System Architecture

QuickPeek uses a modular monolithic architecture with the potential to migrate to microservices as the user base grows. The app relies on real-time data, push notifications, and a PostgreSQL database to handle various user interactions.

- **Backend:** Built with Node.js and TypeScript, using Express.js as the web framework.
- **Database:** PostgreSQL, managed with Prisma ORM for database schema and querying.
- **Queue System:** Redis with Bull for managing background tasks, such as sending push notifications.
- **Authentication:** JWT-based authentication for user login and access control.
- **Containerization:** Docker for local development and production, ensuring consistency in environments.
- **Process Management:** PM2 or Docker for production, handling app and queue process management.

---

## Technology Stack

- **Node.js** (Runtime)
- **TypeScript** (Programming Language)
- **Express.js** (Web Framework)
- **PostgreSQL** (Database)
- **Prisma** (ORM)
- **Redis** (For background jobs and caching)
- **Bull** (Task Queue)
- **JWT** (Authentication)
- **Docker** (For containerization in production)
- **PM2** (Process management in production)
- **Concurrently** (Running multiple services in development)

---

## Setup and Running in Development

### Prerequisites

Ensure the following software is installed on your machine:

- **Node.js** (>= 16.x)
- **npm** (comes with Node.js)
- **Redis** (can be installed locally or use Docker)
- **PostgreSQL** (local or Dockerized)
- **Docker** (optional but recommended)

### Steps

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/your-username/quickpeek.git
   cd quickpeek
   ```

2. **Install Dependencies:**

   Run the following command to install the required Node.js packages:

   ```bash
   npm install
   ```

3. **Set up Environment Variables:**

   Create a `.env` file in the project root and add the following variables:

   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/quickpeek_db
   JWT_SECRET=your_secret_key
   REDIS_URL=redis://localhost:6379
   ```

   Be sure to create a db with the name: `quickpeek_db`

4. **Run Migrations:**

   Set up the PostgreSQL database by running Prisma migrations:

   ```bash
   npm run db:reset:dev
   ```

   This will run the migration files and seed the database.

5. **Start Redis:**

   Redis is used to manage queues for background tasks like push notifications. You can start it locally by running:

   ```bash
   redis-server
   ```

   Alternatively, if using Docker:

   ```bash
   docker run -p 6379:6379 redis
   ```

6. **Start the Development Server:**

   Use `concurrently` to run the server, queue workers, and Redis server simultaneously:

   ```bash
   npm run dev
   ```

   This will run three processes:

   - The Redis server.
   - The main application server.
   - The Bull queue worker.

---

## Running in Production

### Using PM2

For production, it's recommended to use **PM2** for process management, along with Docker or a Redis cloud service like Amazon ElastiCache.

1. **Install PM2 Globally:**

   ```bash
   npm install -g pm2
   ```

2. **Start the Application and Queues:**

   ```bash
   pm2 start src/index.ts --name quickpeek-app --interpreter ts-node
   pm2 start src/queues/index.ts --name quickpeek-queue --interpreter ts-node
   ```

   This will start both the app and queue worker, ensuring they restart on failure and can be monitored.

### Using Docker for Production

1. **Build Docker Images:**

   You can containerize the app for production with Docker. First, build the Docker image:

   ```bash
   docker-compose build
   ```

2. **Run Docker Containers:**

   Start the application using Docker Compose:

   ```bash
   docker-compose up -d
   ```

3. **External Redis (Optional):**

   In production, you should use a managed Redis service like AWS ElastiCache, Google Memorystore, or Azure Redis. Simply update the `REDIS_URL` in your `.env` file to point to your external Redis instance.

---

## Troubleshooting

If you encounter issues during development or production, you can use the following commands:

- **Check logs:**

  ```bash
  pm2 logs
  ```

- **Restart the application:**

  ```bash
  pm2 restart quickpeek-app
  ```

- **Monitor all processes:**
  ```bash
  pm2 list
  ```

For Docker:

- **Check Docker container logs:**
  ```bash
  docker logs <container-id>
  ```

---

## License

This project is licensed under the MIT License.

```

```
