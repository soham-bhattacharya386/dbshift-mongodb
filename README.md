# DBShift — MongoDB Migration Studio

A working full-stack academic website based on the research review of **Development of Migration Tool From Relational Database to Document-Oriented NoSQL Database Utilizing Relational Database Logs** (ICISS 2025).

## Requirements
- Node.js 18 or newer
- MongoDB Community Server running locally, or a MongoDB Atlas connection string

## Setup
1. Open this folder in VS Code.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `MONGODB_URI` in `.env` (default: `mongodb://127.0.0.1:27017`).
5. Run `npm start`.
6. Open http://localhost:3000 in your browser.

## Features
- Project CRUD backed by a real MongoDB database (`migrationProjects` collection)
- MySQL/PostgreSQL project selection
- SQL schema and optional log upload
- Basic CREATE TABLE, column, primary/foreign-key extraction
- Simplified query-log counting and embedding/reference recommendations
- Side-by-side relational and proposed NoSQL views
- Illustrative JSON preview and export
- Save preview documents to MongoDB project records

## Important academic limitations
This is an **educational prototype**, not a full replication of the research paper or a production-grade migration engine. It does **not** connect to source MySQL/PostgreSQL servers, migrate real source rows, materialize actual target MongoDB collections, or implement the paper's row-weighted GAF/UAF, evaluation queue, and recursive JSON mapper. It counts observed query occurrences and uses a simplified 1.125% heuristic. The parser supports common basic SQL CREATE TABLE formats; complex SQL dumps and PostgreSQL-specific constructs may require parser extensions. Never upload sensitive production data to a demo.

## Sample demonstration
Create a project, select it in Migration Studio, click **Load sample files**, then **Analyze schema**. Inspect the decisions, export JSON, and click **Save to MongoDB**. The dashboard updates from the MongoDB database.

## Structure
- `server.js`: Express API and MongoDB persistence
- `public/index.html`: responsive frontend
- `public/style.css`: visual styling
- `public/app.js`: interactions and API calls
