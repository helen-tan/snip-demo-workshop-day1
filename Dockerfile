FROM oven/bun:1-alpine
WORKDIR /app
COPY --chown=bun:bun . .
ENV PORT=3000
ENV PUBLIC_DIR=./public
EXPOSE 3000
USER bun
CMD ["bun", "server.js"]
