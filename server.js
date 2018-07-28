// Server / GitHub auth
const express = require('express')
const { config, app } = require('./node_modules/gatekeeper/server.js')
console.log(app)

const HOME_URL = 'https://bcd-editor.glitch.me/'



// UI assets
app.use(express.static('public'))


// Handle GitHub auth
app.get('/github-auth', (req, res) => {
  res.redirect('https://github.com/login/oauth/authorize?client_id='+process.env.OAUTH_CLIENT_ID+'&scope=read:user public_repo&redirect_uri='+HOME_URL+'github/')
})



// Serve main editor view
app.get('/', function(request, response) {
  response.sendFile(__dirname + '/views/index.html')
});

// Serve transformed compat data
// TODO: make sure we always have the up-to-date files (pull in master/auto-update bcd module)
app.get('/browser-compat.data.json', (req,res) => {
  const bcd = require('./lib/bcd.js').data()
  res.json(bcd)
})



// Start server
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port)
})
