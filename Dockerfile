FROM node:22-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build \
    && mkdir -p /app/cache-data /app/certs \
    && chown -R node:node /app

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

USER node

CMD ["node", "dist/server.js"]
