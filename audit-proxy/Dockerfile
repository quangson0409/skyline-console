FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8788 \
    DB_DRIVER=mariadb
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY sql ./sql
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/audit-api/health || exit 1
CMD ["node", "src/index.js"]
