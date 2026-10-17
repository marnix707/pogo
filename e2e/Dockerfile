# Playwright + Chromium for the end-to-end tests. Version must match @playwright/test in package.json.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /e2e
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "test"]
