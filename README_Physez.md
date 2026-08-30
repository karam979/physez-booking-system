# PhysEZ

PhysEZ is a multilingual full-stack platform for private physics tutoring, lesson booking, student management, and learning support.

The system includes a student website, an admin dashboard, a Node.js backend, a PostgreSQL database, and automation for notifications and calendar updates.

## Live Project

- Student website: https://physezstudents.netlify.app/
- Admin dashboard: https://phyzezadmin.netlify.app/login
- API health check: https://auto-flows-979.duckdns.org/api/health

## Main Features

### Student Website

- User registration and login
- Arabic, Hebrew, and English support
- Physics topic selection
- Zoom or in-person lesson booking
- Lesson duration and language selection
- Available date and time selection
- Booking status tracking
- Diagnostic physics quizzes
- Responsive interface for desktop and mobile

### Admin Dashboard

- Secure admin login
- View and manage booking requests
- Approve, reject, cancel, and complete bookings
- Filter bookings by status
- Manage physics topics and quizzes
- Review student information
- Manage lesson scheduling

### Automation

PhysEZ uses n8n for external integrations and automated workflows.

Examples include:

- Telegram notifications for new booking requests
- Google Calendar synchronization for confirmed lessons
- Internal backend callbacks after automation tasks

## Tech Stack

### Frontend

- React
- Vite
- JavaScript
- CSS
- Netlify

### Backend

- Node.js
- Express.js
- REST API
- JWT authentication
- Secure HttpOnly cookies

### Database

- PostgreSQL

### Infrastructure and Automation

- Docker
- Docker Compose
- Caddy
- n8n
- Telegram Bot API
- Google Calendar API
- VPS hosting

## Architecture

```text
Student React App ─┐
                   ├──> /api ──> Netlify Proxy ──> Caddy ──> Express API
Admin React App ───┘                                      │
                                                         ├──> PostgreSQL
                                                         │
                                                         └──> n8n
                                                              ├──> Telegram
                                                              └──> Google Calendar
```

The two frontend applications are deployed on Netlify.

Frontend requests are made through `/api`, which Netlify proxies to the backend running on the VPS.

Caddy provides HTTPS and reverse-proxy routing on the VPS. The Express API handles authentication, validation, business logic, and database access.

PostgreSQL stores users, topics, bookings, lessons, quizzes, quiz attempts, and related application data.

n8n is used as the automation layer for integrations such as Telegram notifications and Google Calendar.

## Project Structure

```text
physez-booking-system/
├── apps/
│   ├── student-web/
│   └── admin-web/
├── server/
├── deploy/
├── docker/
├── n8n/
├── DESIGN.md
├── DEPLOY.md
├── docker-compose.yml
├── docker-compose.prod.yml
└── README.md
```

## Authentication

PhysEZ uses JWT-based authentication.

The general login flow is:

1. The user submits an email and password.
2. The Express backend verifies the account and password.
3. A JWT is created after successful authentication.
4. The token is stored in a Secure HttpOnly cookie.
5. Authentication middleware verifies the user on protected API requests.
6. Authorization rules determine whether the user can access student or admin functionality.

Internal n8n callbacks use a separate shared secret rather than user authentication.

## Booking Flow

```text
Student selects lesson details
        ↓
Student chooses an available time
        ↓
Booking request is created
        ↓
Admin receives a Telegram notification
        ↓
Admin reviews the request
        ↓
Booking is approved or rejected
        ↓
Approved lesson is added to Google Calendar
        ↓
Student sees the updated booking status
```

## Diagnostic Quizzes

The platform includes diagnostic quizzes for several physics topics, including:

- Mechanics
- Electricity
- Waves
- Optics
- Modern Physics

Quiz content is available in Arabic, Hebrew, and English.

## Local Development

### Requirements

- Node.js
- npm
- PostgreSQL
- Docker and Docker Compose if using the containerized setup

Clone the repository:

```bash
git clone https://github.com/karam979/physez-booking-system.git
cd physez-booking-system
```

Install the dependencies for the required application before running it locally.

Example for the student website:

```bash
cd apps/student-web
npm install
npm run dev
```

Example for the admin website:

```bash
cd apps/admin-web
npm install
npm run dev
```

The backend requires its own environment configuration. Use the provided example environment file as a reference and never commit real secrets to Git.

## Deployment

The project is deployed using:

- Netlify for the student and admin frontends
- VPS hosting for the API and backend services
- Docker Compose for backend infrastructure
- Caddy for HTTPS and reverse-proxy routing
- PostgreSQL for persistent application data
- n8n for automated workflows and external integrations

More deployment details are available in `DEPLOY.md`.

## Future Development

Planned ideas for future versions of PhysEZ include:

- Recorded physics courses
- Student credit system for lessons and courses
- Online payments
- AI assistant for student support
- AI dubbing of recorded lessons into Arabic, Hebrew, and English
- Interactive physics simulations and educational games
- Expanded student progress tracking
- Lesson packages and recurring bookings
- Additional analytics for students and administrators

## Author

**Karam Shekh Yusuf**

PhysEZ was developed as a full-stack project for managing private physics tutoring through one connected platform.

## Copyright

© 2026 Karam Shekh Yusuf. All rights reserved.

This project, including its source code, system design, documentation, user interface, learning content, course structure, quizzes, and future platform concepts, is the intellectual property of Karam Shekh Yusuf.

No permission is granted to copy, modify, distribute, sublicense, sell, publish, reuse, or use this project or any part of it for commercial, educational, or public purposes without prior written permission from the owner.

This repository is shared for project presentation and portfolio review purposes only.
