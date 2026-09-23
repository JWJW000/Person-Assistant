FROM assistant-pi-runner:0.17.6-lockfix
USER root
RUN apk add --no-cache openssh-client
COPY server-exec /usr/local/bin/server-exec
RUN chmod 755 /usr/local/bin/server-exec
USER 1000:1000
