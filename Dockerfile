FROM node:22-alpine AS base

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src

RUN npm install --production=false
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=base /app/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/server.js"]

