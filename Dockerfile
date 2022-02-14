FROM node:16-alpine

LABEL maintainer="Brandon Flick - https://bflick.dev"

RUN apk add --update --no-cache ca-certificates bash curl
RUN mkdir -p /app

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .

ENV MONGO_URL_STRING=mongodb://sb-database/sb-backend

EXPOSE 5820

CMD ["node", "index.js"]
