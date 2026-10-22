FROM node:24.21.0-alpine3.23
WORKDIR /app
ENV NODE_ENV=production TZ=UTC
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node db ./db
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public
COPY --chown=node:node test ./test
RUN mkdir -p /var/log/app && chown node:node /var/log/app
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
