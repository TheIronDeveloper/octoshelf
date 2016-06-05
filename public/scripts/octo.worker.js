/**
 * Octo Worker
 * All xhr fetching and state management happens here. If you need to make an
 * update to the repository array, then you would do it here by calling a
 * parsedPostMessage from app.js.
 *
 * If you need to make a DOM update (state has changed somehow), then you would
 * call `parsedPostMessage()`
 */

'use strict';
let ports = [];
let repositories = [];
let apiUrl = '';
let githubUrl = '';
let accessToken = '';

const repository = {
  url: '',
  placeholderUpdated: false,
  fetchedDetails: false
};

// Its refreshing!
const peppermint = {
  refreshTimeout: null,
  refreshFn(delay) {
    log(`Refreshing at ${new Date()}`);
    parsedPostMessage('hasRefreshed', '');
    getAllRepoDetails();
    this.refreshTimeout = setTimeout(() => this.refreshFn(delay), delay);
  },
  startRefreshing(delay) {
    if (this.refreshTimeout) {
      stopRefreshing();
    }
    this.refreshTimeout = setTimeout(() => this.refreshFn(delay), delay);
  },
  stopRefreshing() {
    clearTimeout(this.refreshTimeout);
  }
};

/**
 * Start the refreshing process
 * @param {Number} delay -  delay between each refresh
 */
function startRefreshing(delay) {
  peppermint.startRefreshing(delay);
}

/**
 * End the refreshing process
 */
function stopRefreshing() {
  peppermint.stopRefreshing();
}

/**
 * Set the access token for future github api requests
 * @param {String} newAccessToken - new access token from server
 */
function setAccessToken(newAccessToken) {
  accessToken = newAccessToken;
}

/**
 * Given a PR Object (from Github's API), return a slimmer version
 * @param {Object} PullRequest - Pull Request Object from the github api
 * @return {Object} simplePullRequest - smaller, cleaner pull request object
 */
function simplifyPR({id, title, html_url: url}) {
  return {id, title, url};
}

/**
 * Add a Repo to our repos array
 * @param {String} url - Url of the repo we are adding
 * @return {Promise} repoDetails - repo's details and open prs
 */
function addRepo(url) {
  if (repositories.some(repo => repo.url === url)) {
    parsedPostMessage('notify', 'That repo was already added');
    return;
  }

  let newRepository = Object.assign({}, repository, {
    prs: [],
    url: url
  });

  repositories.push(newRepository);

  parsedPostMessage('drawPlaceholderRepo', newRepository);
  return getRepoDetails(newRepository);
}

/**
 * Attempt to add a repo via localstorage, but silently fail if it already
 * exists. We will be doing a full refresh on page load to sort through
 * the differences anyhow.
 *
 * @param {String} url - repo url
 */
function addRepoFromLocalStorage(url) {
  if (!repositories.some(repo => repo.url === url)) {
    addRepo(url);
  }
}

/**
 * Remove the repo from the dom
 * @param {String} url - url of the repo we are removing
 */
function removeRepo(url) {
  repositories = repositories.filter(repo => repo.url !== url);
  parsedPostMessage('removeRepository', url);
}

/**
 * Fetch from the Github API.
 * The access_token is important because it increases the rate limit.
 * @param {String} url - url we are fetching from
 * @param {String} accessToken - token we are passing to Github
 * @return {Promise} GithubApiResponse - response given back by github
 */
function fetchGithubApi(url, accessToken) {
  if (!accessToken) {
    return fetch(`${url}`);
  }

  return fetch(`${url}?access_token=${accessToken}`);
}

/**
 * Fetch Details about a Repo (title, etc)
 * @param {String} repoUrl - repo url
 * @return {Promise} response - Repo details
 */
function fetchRepoDetails(repoUrl) {
  return fetchGithubApi(`${apiUrl}/repos/${repoUrl}`, accessToken);
}

/**
 * Fetch a Repo's Pull Requests
 * @param {String} repoUrl - repo url
 * @return {Promise} response - Pull Request and their details
 */
function fetchRepoPulls(repoUrl) {
  return fetchGithubApi(`${apiUrl}/repos/${repoUrl}/pulls`, accessToken);
}

/**
 * Fetch a Repo's details and open pull requests
 * @param {String} repoUrl - Repo Url
 * @return {Promise.<T>} [repoDetails, repoPullRequests]
 */
function fetchRepo(repoUrl) {
  return Promise.all([fetchRepoDetails(repoUrl), fetchRepoPulls(repoUrl)])
    .then(([repoDetails, repoPulls]) => {
      return Promise.all([repoDetails.json(), repoPulls.json()]);
    });
}

/**
 * Get Details about a repository
 * @param {Object} repository - repo
 * @param {Element} placeholder - temp element
 * @return {Promise.<T>} RepoDetails - repo details
 */
function getRepoDetails(repository) {
  let {id, url, fetchedDetails} = repository;
  let repoUrl = url.replace(githubUrl, '');
  let repoStillOnDom = true;

  // If we already got the repository details, lets only fetch pull requests
  if (fetchedDetails) {
    parsedPostMessage('toggleLoadingRepository', [id, url, true]);
    return fetchRepoPulls(repoUrl)
      .then(repoPulls => repoPulls.json())
      .then(repoPulls => {
        repository.prs = repoPulls.map(simplifyPR);
      })
      .catch(() => {
        removeRepo(url);
        parsedPostMessage('notify', 'Invalid Url');
        repoStillOnDom = false;
      })
      .then(() => {
        if (repoStillOnDom) {
          parsedPostMessage('updateRepository', repository);
          parsedPostMessage('toggleLoadingRepository', [id, url, false]);
        }
      });
  }

  return fetchRepo(repoUrl)
    .then(([{id, name, full_name}, repoPulls]) => {
      /* eslint camelcase:0 */
      repository.id = id;
      repository.name = name;
      repository.fullName = full_name;
      repository.prs = repoPulls.map(simplifyPR);
      repository.fetchedDetails = true;
    })
    .catch(() => {
      removeRepo(url);
      parsedPostMessage('notify', 'Invalid Url');
      repoStillOnDom = false;
    })
    .then(() => {
      if (repoStillOnDom) {
        parsedPostMessage('updateRepository', repository);
        parsedPostMessage('toggleLoadingRepository', [id, url, false]);
      }
    });
}

/**
 * Foreach through all the repos, getting details for each of them
 * (which in turn updates the DOM with each of them)
 */
function getAllRepoDetails() {
  repositories.forEach(repository => {
    getRepoDetails(repository);
  });
}

/**
 * Get all the repoDetails, but without making any Github api calls
 */
function getAllCachedRepoDetails() {
  repositories.forEach(repository => {
    parsedPostMessage('updateRepository', repository);
  });
}

/**
 * Given a url, call the getRepoDetails function
 * @param {String} url - url of a repo
 */
function getRepoDetailsByUrl(url) {
  let repository = repositories.find(repo => repo.url === url);
  getRepoDetails(repository);
}

/**
 * Unwrap PostMessages
 * @param {Function} fn - function to call
 * @param {Function} msgType - function name
 * @param {String} params - Stringified object that contains a postData prop
 * @param {Number} portNumber - shared worker port number
 */
function unwrapPostMessage(fn, msgType, params, portNumber) {
  let parsedParams = JSON.parse(params);
  let postData = parsedParams.postData;
  log(`[Worker ${portNumber}] "${msgType}" called with:`, postData);
  fn(postData);
}

/**
 * This log function simply does a postMessage to the app
 */
function log() {
  parsedPostMessage('log', [...arguments]);
}

/**
 * Init a bunch of api variables so we can access github's api
 * @param {String} initAccessToken - github access token
 * @param {String} initApiUrl - github api url, which differs for corp accounts
 * @param {String} initGithubUrl - github root url
 */
function initAPIVariables({initAccessToken, initApiUrl, initGithubUrl}) {
  accessToken = initAccessToken;
  apiUrl = initApiUrl;
  githubUrl = initGithubUrl;
}

/**
 * This function is used almost exclusively for testing. It returns an object
 * that contains the app's state.
 * @return {Object} state
 */
function getWorkerState() {
  return {repositories, accessToken};
}

/**
 * Send a Parsed Post Message
 * @param {String} messageType - function we will attempt to call
 * @param {*} postData - Some data that we will wrap into a stringified object
 */
function parsedPostMessage(messageType, postData) {
  ports.forEach(port => {
    port.postMessage([messageType, JSON.stringify({postData})]);
  });
}

/**
 * Init the shared worker!
 * @param {Event} e - connection event
 */
self.onconnect = function(e) {
  let port = e.ports[0];
  let portNumber = (ports.push(port));

  port.addEventListener('message', function({data: [msgType, msgData]}) {
    let msgTypes = {
      startRefreshing,
      stopRefreshing,
      getRepoDetails,
      getAllRepoDetails,
      getAllCachedRepoDetails,
      getRepoDetailsByUrl,
      setAccessToken,
      initAPIVariables,
      removeRepo,
      addRepoFromLocalStorage,
      addRepo
    };

    if (msgTypes[msgType]) {
      return unwrapPostMessage(msgTypes[msgType], msgType, msgData, portNumber);
    }
    log(`"${msgType}" isn't part of the allowed functions`);
  });

  port.start();
};

// Exposing functions for avajs tests, only if module.exports is available
try {
  if (typeof module === 'object' && module.exports) {
    module.exports = {

      getWorkerState,

      setAccessToken,
      simplifyPR,
      addRepo,
      removeRepo,
      fetchGithubApi,
      fetchRepoDetails,
      fetchRepoPulls,
      fetchRepo,
      getRepoDetails,
      getAllRepoDetails,
      getRepoDetailsByUrl
    };
  }
} catch (e) {
  /**
   * I know I am being extra paranoid by try-catching this. But testing related
   * code should never harm core experiences.
   */
}
