/* global Octokit, rfc6902 */

var GitScripts = (function(){
  const repo = 'browser-compat-data'
  const repo_owner = 'mdn'

  let authResponse

  // Back-direct from GitHub Auth
  if (window.opener && ( authResponse=window.location.search.match(/code=(\w+)/) )) {
    const code = authResponse[1]
    fetch(`/authenticate/${code}`).then(res => res.json()).then(oauth => {
      window.localStorage.setItem('github-auth-token', oauth.token)
      //console.log('OAuth token:', oauth)
  
      const octokit = new Octokit()
      octokit.authenticate({ type: 'token', token: oauth.token })
      octokit.users.get({}).then(github => {
        window.localStorage.setItem('github-auth-user', github.data.login)
        //console.log('Authenticated user:', github.data.login)
        window.close()
      }).catch(err => console.error(err))
    })
  }


    function authenticated() {
    return window.localStorage.getItem('github-auth-token')
  }

  function authenticate() {
    window.open('/github-auth')
  }

  async function compare(path, contents) {
    const token = authenticated()
    const user = window.localStorage.getItem('github-auth-user')

    if (!token || !user) throw new Error('Not authenticated!')

    const octokit = new Octokit()

    console.log('authenticating with', octokit)

    let ghAuth = { type: 'oauth' }
    ghAuth.token = token
    //ghAuth.token = private_token

    octokit.authenticate(ghAuth)

    // Fork the browser compat repo
    await octokit.repos.fork({
      owner: repo_owner,
      repo
    })

    // Get the local repo
    //const result = await octokit.gitdata.getReferences({owner: user, repo})
    const upstream = await octokit.gitdata.getReference({owner: repo_owner, repo, ref: 'heads/master'})
    console.log(upstream.data.object.sha)

    const rnd = (Math.random()*16000).toFixed(0).toString(16)
    const branch = 'bcd-toolkit-'+user+'-'+rnd
    const sha = upstream.data.object.sha
    console.log(sha, branch)

    // Create new branch from upstream master
    const result = await octokit.gitdata.createReference({owner: user, repo, ref: 'refs/heads/' + branch, sha})
    console.log(result)

    // Get original file
    const originalFile = await octokit.repos.getContent({owner: repo_owner, repo, path})
    console.log(originalFile)

    // Patch it
    const patchedFileContents = contents
    //atob(originalFile.data.content).replace(/"42"/,'"*magic*"')

    // update fork
    const updatedFile = await octokit.repos.updateFile({
      owner: user,
      repo,
      path,
      message: 'Updated compat tables by '+user,
      content: btoa(patchedFileContents),
      sha: originalFile.data.sha,
      branch,
    })

    //console.log(updatedFile)
    const cmp = `https://github.com/mdn/${repo}/compare/master...${user}:${branch}`
    console.log(cmp)
    window.open(cmp)
  }

  return ({
    authenticated, authenticate, compare
  })
})()
