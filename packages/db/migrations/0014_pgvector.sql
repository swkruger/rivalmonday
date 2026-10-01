-- Spec §10.2: Postgres + pgvector. Live-checked 2026-10-01: Neon offers vector 0.8.6 and the owner
-- role can create it; CI and docker-compose use the pgvector/pgvector:pg16 image.
CREATE EXTENSION IF NOT EXISTS vector;
