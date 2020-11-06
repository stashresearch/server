module.exports = {
  apps : [{
    name: 'stash',
    script: 'npm -- start',
    instances: 1,
    watch: false,
    error_file: '~/.pm2/logs/err.log',
    out_file: '~/.pm2/logs/out.log',
    log_file: '~/.pm2/logs/combined.log',
  }],
  deploy : {
    production : {
      user : 'SSH_USERNAME',
      host : 'SSH_HOSTMACHINE',
      ref  : 'origin/master',
      repo : 'GIT_REPOSITORY',
      path : 'DESTINATION_PATH',
      'pre-deploy-local': '',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
