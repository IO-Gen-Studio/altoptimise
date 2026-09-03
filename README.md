# Optimise

Create a modern, responsive desktop-first web application that acts as an "App Launcher" portal for an advanced Energy Management System. This launcher will serve as the central hub for multiple intelligent energy analysis mini-apps that share a underlying data ecosystem. Let's call this "Optimise"

1. Visual & UX Concept

Theme: Clean, data-centric, and professional (light mode preferred or toggable, using modern Tailwind components).

Layout: A main dashboard grid displaying available "mini-apps" as interactive cards/icons, a collapsible sidebar for global navigation (Organisations, Profile, Settings), and a top bar showing the current active Organisation.

2. Authentication & Multi-Tenancy Architecture

Implement a robust mock authentication flow (ready to connect to Supabase/Firebase) with the following structure:

Organisations: Users can belong to one or more organisations (e.g., "Factory A", "Corporate HQ"). Changing the organisation in the global dropdown filters data/apps accordingly.

User Roles: - Super Admin: Full access to all apps, system settings, and organisation management.

Data Analyst: Access to advanced analysis mini-apps, read/write data access.

Viewer: Restricted access to basic monitoring mini-apps, read-only data.

3. App Launcher Features

App Grid: Display the following 2 placeholder mini-apps to demonstrate the launcher functionality:

Baseload Scoring: Scans electricity and gas data for unusual consumption/ usage.

Sustainability Tracker: Calculates carbon footprint from total consumption data.

Role-Based Access Control (RBAC): Grey out or hide specific mini-app cards if the logged-in user role doesn't have permission to access them (e.g., Viewer cannot open 'Anomaly Detector').

Shared Data Layer Notice: Include a mock notification or status indicator showing that all apps are successfully connected to the central data stream (Electricity, Gas, Water, Solar PV).

4. Interactive Elements for Prototype

Add a user profile switcher in the corner to easily toggle between a 'Super Admin', 'Data Analyst', and 'Viewer' so I can test the permission gates.

Add an Organisation switcher dropdown.

When clicking an allowed mini-app, it should smoothly transition into that app's dashboard view, with a clear "Back to Launcher" button to return to the main hub.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ee98978b-7b35-47b1-b045-9046d4a4d120).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
