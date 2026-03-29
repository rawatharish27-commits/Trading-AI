# Trading AI Agent - Python Backend
# Optimized for Render deployment with PostgreSQL/Supabase
# v2.2 - Aggressive cache bust

# Build argument for cache busting
ARG CACHE_BUST=2024-01-01

FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy requirements first
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Force cache invalidation - this changes with every build
ARG CACHE_BUST
RUN echo "Build time: $(date) - Cache bust: ${CACHE_BUST}"

# Copy ALL application code
COPY . .

# Debug: show what's in the database module
RUN echo "=== Database module contents ===" && \
    ls -la /app/app/database/ && \
    echo "=== Database __init__.py exports ===" && \
    head -50 /app/app/database/__init__.py

# Create non-root user
RUN useradd -m -u 1000 trader && \
    chown -R trader:trader /app

USER trader

# Expose port
EXPOSE 3030

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3030/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3030"]
