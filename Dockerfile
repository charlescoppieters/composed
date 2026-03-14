FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
COPY shared/ ./shared/
WORKDIR /app/server
RUN npm install
COPY server/ .
RUN npx tsc
EXPOSE 3001
ENV PORT=3001
CMD ["node", "dist/index.js"]
