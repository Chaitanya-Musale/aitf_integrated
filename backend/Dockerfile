FROM node:18-alpine

# Set timezone
ENV TZ=Asia/Kolkata
RUN apk add --no-cache tzdata

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5000

CMD ["npm", "start"]