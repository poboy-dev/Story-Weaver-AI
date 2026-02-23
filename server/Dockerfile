FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# In a real build step we might use tsc, but for flash deployment tsx is fine
# or we just copy the compiled dist. Let's assume user might want simple Node execution.

EXPOSE 8080

CMD ["npx", "tsx", "index.ts"]
