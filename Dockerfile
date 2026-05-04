FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY dist ./dist
COPY server.mjs ./server.mjs

EXPOSE 4178

CMD ["node", "server.mjs"]
