FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

RUN mkdir -p /app/data/storageState /app/data/jobs /app/data/artifacts /app/data/tmp

EXPOSE 3000

CMD ["npm", "start"]
