# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first (cache-friendly)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY . ./

# Build-time env for Vite (optional)
ARG VITE_SIGNAL_URL
ENV VITE_SIGNAL_URL=${VITE_SIGNAL_URL}

RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine
WORKDIR /app

# Only ship built files + a tiny server
RUN npm i -g vite@5

COPY --from=build /app/dist ./dist

# We will serve on 3000
EXPOSE 3000

# IMPORTANT: bind to 0.0.0.0 and set the port explicitly
CMD ["vite", "preview", "--host", "0.0.0.0", "--port", "3000", "--strictPort"]
