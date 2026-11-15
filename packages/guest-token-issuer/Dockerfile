FROM node:24-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/guest-token-issuer/package.json packages/guest-token-issuer/package.json
RUN pnpm install --filter @visualtalk/guest-token-issuer --prod --frozen-lockfile

COPY packages/guest-token-issuer/src packages/guest-token-issuer/src

ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["pnpm", "--filter", "@visualtalk/guest-token-issuer", "start"]
