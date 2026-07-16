FROM oven/bun:1-debian

# Prisma's debian-openssl-3.0.x query engine binary needs libssl.so.3 at
# runtime. Two prior attempts to provide this via Nixpacks (a Nix openssl
# package + manual ldconfig registration, then aptPkgs) both failed to
# persist into the actual running container — switching to a Dockerfile
# removes that ambiguity: this apt-get install runs in the same image that
# actually starts the app, full stop.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

COPY . .
RUN bunx prisma generate --schema=./prisma/schema.prod.prisma
RUN bun run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "railway:start"]
