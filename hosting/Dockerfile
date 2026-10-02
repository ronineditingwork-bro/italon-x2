FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/data/cart.sqlite
RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "server/server.mjs"]
