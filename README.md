# stash-server

## NPM scripts

- `npm run dev`: Start development mode (load all services locally with hot-reload & REPL)
- `npm run start`: Start production mode (set `SERVICES` env variable to load certain services)
- `npm run cli`: Start a CLI and connect to production. Don't forget to set production namespace with `--ns` argument in script
- `npm run lint`: Run ESLint
- `npm run ci`: Run continuous test mode with watching
- `npm test`: Run tests & generate coverage report
- `npm run dc:up`: Start the stack with Docker Compose
- `npm run dc:down`: Stop the stack with Docker Compose

# Setup

## node
sudo apt-get install curl

curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -

sudo apt-get install nodejs

## Keys (services/config/keys) to create Bearer token
# generate private key
openssl genrsa -out privateKey.pem 2048
# extract public key from it
openssl rsa -in privateKey.pem -pubout > publicKey.pem

## NATS for moleculer
download https://github.com/nats-io/nats-server/releases/download/v2.1.4/nats-server-v2.1.4-amd64.deb

## Redis install
apt-get install redis

## Nginx setup
https://www.digitalocean.com/community/tutorials/how-to-install-nginx-on-ubuntu-18-04#step-5-setting-up-server-blocks-(recommended)

# Letsencrypt
https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-18-04

## UI open google drive file info
https://developers.google.com/drive/api/v3/handle-errors#resolve_a_403_error_the_user_has_not_granted_the_app_appid_verb_access_to_the_file_fileid 

# csv diff
http://paulfitz.github.io/daff/

# Github/google registration

## Google dev console setup

##Install mongoDB
https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/