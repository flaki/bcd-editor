/* global Octokit, rfc6902, GitScripts, JSONEditor */

// replace with
// <input class="value" data-value="api.HTMLCanvasElement.__compat.support.chrome.version_added" value="4" style="width: 2em;background: transparent;border: none;text-align: center;" data-com.agilebits.onepassword.user-edited="yes" type="text">
// for inline editing

fetch('browser-compat.data.json').then(r => r.json()).then(r => window.browser_compat_data = r).then(_ => {
  //create field list
  let list = (function pathgen(key, data) {
    const keys = typeof data==='object' && Object.keys(data)
    return [ key, !keys || '__compat' in data || 'releases' in data ? [] : keys.map(k => pathgen(k, data[k])) ]
  })('', window.browser_compat_data)[1]

  let jsonlist = list.reduce( (a,b) => {
    if (b) return (function rec(a,b0,b1) {
      let ret = b0
      if (b1 && typeof b1 === 'object' && b1.length>0) ret = b1.reduce( (r, bd) => r.concat(rec(null,b0+'/'+bd[0],bd[1])), [])
      return a ? a.concat(ret) : ret
    })(a,b[0],b[1])
  }, [])

  document.body.insertAdjacentHTML('beforeend', '<datalist id="sources">'+jsonlist.map(s => `<option value="${s}">`).join('')+'</datalist>')

  // update if selected property changes
  document.querySelector('header>input').addEventListener('change', e => editCompat(e.target.value))
  // blur (and thus, update) on [Enter]
  document.querySelector('header>input').addEventListener('keydown', e=>{ if(e.key==='Enter') setTimeout(_ => e.target.blur(), 200) })

  document.querySelector('button[name="show"]').addEventListener('click', e => {
    window.open(e.target.dataset.url)
  })

  document.querySelector('button[name="copy"]').addEventListener('click', (e) => {
    if (e.target.disabled) return;

    const path = window.$path
    const changelist = JSON.parse(document.body.dataset.changelist||'[]')
    console.log(changelist)

    getUpdatedFile(path, changelist).then(data => {
      let txt = document.createElement('textarea')
      txt.value = data.contents
      txt.select()
      if (!document.execCommand("copy")) {
        let w = window.open('about:blank')
        if (w) {
          w.document.write(data.contents)
          w.document.body.style.whiteSpace="pre";
          w.document.body.style.fontFamily="monospace"
        } else {
          alert('Blocked window.open')
        }
      }
    })
  })

  document.querySelector('button[name="compare"]').addEventListener('click', (e) => {
    if (e.target.disabled) return;

    if (!GitScripts.authenticated()) {
      GitScripts.authenticate()
      return alert('Please allow GitHub access first.')
    }

    const path = window.$path
    const changelist = JSON.parse(document.body.dataset.changelist)
    getUpdatedFile(path, changelist).then(data => {
      GitScripts.compare(data.file, data.contents)
    })
  })
  

  // initial
  let path = document.querySelector('header>input').value||'api.HTMLCanvasElement';
  editCompat(path)


  // Jump to cell
  document.querySelector('main').addEventListener('click', e => {
    let c = identifyCell(e.target)
    let path = (c.feature === '.' ? '' : '.' + c.feature) + (c.browser ? `.__compat.support.${c.browser}` : '');
    console.log(c, path);
    let node = window.json_editor.node.findNode(path);
    //node.expandTo();
    node.expand(); //node.parent.expand();
    node.scrollTo();
    if (window.$highlightedNode) window.$highlightedNode.setHighlight(false);
    setTimeout(_ => node.setHighlight(true), 100);

    window.$highlightedNode = node;
  })

  // GitHub login status handling
  document.addEventListener('visibilitychange', updateGitHubLoginStatus, false);
  updateGitHubLoginStatus()
})



function updateGitHubLoginStatus(e) {
  const loggedin = document.querySelector('.logged-in-as')
  const username = window.localStorage.getItem('github-auth-user')
  console.log(loggedin,username)
  if (loggedin && username) loggedin.textContent = ` (logged in as: ${username})`
}

function editCompat(path) {
  window.$path = path;

  document.querySelector('button[name="show"]').dataset.url=`https://github.com/mdn/browser-compat-data/blob/master/${pathToFile(path)}`

  initJsonEditor(objectPath(window.browser_compat_data, path))
  renderPath(path)
}

function renderPath(path) {
  const obj = objectPath(window.browser_compat_data, path);
  return obj && renderCompatTable(obj, path)
}

function renderCompatTable(obj, path) {
  const ct = obj && render_compat_table(obj, window.renderer, { 'query': path, 'depth': 1 });

  document.querySelector('main').innerHTML = ct || 'not found';
}

function objectPath(object, path) {
  try {
    path.split(/\.|\//).forEach(key => object = object[key])
    return object
  }
  catch(e) {
    return null;
  }
}

function initJsonEditor(data) {
  // create local copy
  const localData = JSON.parse(JSON.stringify(data))


  let container = document.querySelector('.jsoneditor');
  let options = {
      mode: 'tree',
      onChange: () => {
        const updatedData = window.json_editor.get();
        const baseData = objectPath(window.browser_compat_data, window.$path)

        // Update local data with changes and re-render
        cloner.deep.merge(localData, updatedData)
        renderCompatTable(localData, window.$path)

        // create patch from changes
        const jpatch = rfc6902.createPatch(baseData, localData)
        console.log(jpatch)

        // allow merging of current changes
        const cmpBtn = document.querySelector('button[name="compare"]')
        cmpBtn.disabled = !jpatch.length
        if (jpatch.length>0) {
          document.body.dataset.changelist = JSON.stringify(jpatch)
        }

      }
  };

  if (window.json_editor) window.json_editor.destroy();
  window.json_editor = new JSONEditor(container, options);

  window.json_editor.set(localData);
}

function identifyCell(e) {
  let pathInfo = {}
  while (e.parentNode.tagName !== 'MAIN') {
    if (e.dataset.feature) pathInfo.feature = e.dataset.feature;
    if (e.dataset.browser) pathInfo.browser = e.dataset.browser;
    e = e.parentNode
  }
  return pathInfo
}

function pathToFile(path) {
  let p = path.split('/')

  // Only consider first three elements
  p = p.slice(0,3)

  // Http headers are all-lowercase
  if (p[0]==='http' && p[2]) p[2]=p[2].toLowerCase()
console.log(p)
  return p.join('/')+'.json'
}

function getUpdatedFile(path, changelist) {
  return fetch(`https://cdn.rawgit.com/mdn/browser-compat-data/master/${pathToFile(path)}`)
  .then(r => r.text())
  .then(f => {
    let updatedFile = JSON.parse(f)

    if (changelist && changelist.length) {
      rfc6902.applyPatch(
        updatedFile,
        // Expand changelist paths
        changelist.map(c => Object.assign(c, { path: '/'+path+c.path }))
      )
      console.log(updatedFile, 'changed')
    }

    const updatedFileContents = JSON.stringify(updatedFile, null, 2 ) + '\n'
    console.log(updatedFileContents)

    return { file: pathToFile(path), contents: updatedFileContents }
  })
}
