/* global $, window, document, history,
  d3, formdb, wNumb  */

// wNumb is from nouislider

/**
 * TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
 *
 * Rudimentary pushstate/popstate support is implemented, but lots
 * of stuff still needs to be fixed:
 *
 *   * `.filter_active` on inputs needs to update properly.
 *   * We should probably remove hourglass.qs.parse and
 *     hourglass.qs.format.
 *   * Make sure this works on IE11, at least.
 *
 * TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
 */

import { createStore, applyMiddleware } from 'redux';

import hourglass from '../common/hourglass';

import ga from '../common/ga';

import createTable from './table';

import {
  invalidateRates,
  resetState,
} from './actions';

import appReducer from './reducers';

import histogramToImg from './histogram-to-img';

import initializeAutocomplete from './autocomplete';

import StoreHistorySynchronizer from './history';

import {
  StoreFormSynchronizer,
  StoreStateFieldWatcher,
} from './temp-redux-middleware';

import StoreRatesAutoRequester from './rates-request';

import initReactApp from './app';

const api = new hourglass.API();
const search = d3.select('#search');
const form = new formdb.Form(search.node());
const formSynchronizer = new StoreFormSynchronizer(form);
const historySynchronizer = new StoreHistorySynchronizer(window);
const ratesRequester = new StoreRatesAutoRequester(api);
const storeWatcher = new StoreStateFieldWatcher();
const store = createStore(
  appReducer,
  applyMiddleware(
    () => next => action => {
      // TODO: Remove this logging middleware eventually.
      console.log(action.type, store.getState());  // eslint-disable-line

      return next(action);
    },
    storeWatcher.middleware,
    formSynchronizer.reflectToFormMiddleware,
    ratesRequester.middleware,
    historySynchronizer.reflectToHistoryMiddleware
  )
);
const inputs = search.selectAll('*[name]');
const loadingIndicator = search.select('.loading-indicator');
const histogramRoot = document.getElementById('price-histogram');
const histogramDownloadLink = document.getElementById('download-histogram');
const table = createTable('#results-table');

function onCompleteRatesRequest(error) {
  search.classed('loading', false);

  if (error) {
    if (error === 'abort') {
      // ignore aborts
      return;
    }

    search.classed('error', true);

    loadingIndicator.select('.error-message')
      .text(error);
  } else {
    search.classed('error', false);
  }

  search.classed('loaded', true);

  table.updateResults();
}

function onStartRatesRequest() {
  table.updateSort();

  inputs
    .filter(function filter() {
      return this.type !== 'radio' && this.type !== 'checkbox';
    })
    .classed('filter_active', function classed() {
      return !!this.value;
    });

  search.classed('loaded', false);
  search.classed('loading', true);

  const data = ratesRequester.getRatesParameters(store);

  d3.select('#export-data')
    .attr('href', function updateQueryString() {
      return [
        this.href.split('?').shift(),
        hourglass.qs.format(data),
      ].join('?');
    });
}

storeWatcher.watch('rates', () => {
  const rates = store.getState().rates;

  if (!rates.stale) {
    if (rates.inProgress) {
      onStartRatesRequest();
    } else {
      onCompleteRatesRequest(rates.error);
    }
  }
});

storeWatcher.watch('contract-year', () => {
  table.updateResults();
});

function initialize() {
  table.initialize(store);

  initializeAutocomplete(store, api, $('#labor_category'));

  inputs.on('change', () => {
    formSynchronizer.reflectToStore(store);
  });

  historySynchronizer.initialize(store, () => {
    ga('set', 'page', window.location.pathname +
                      window.location.search);
    ga('send', 'pageview');
  });

  store.dispatch(invalidateRates());
}

// set default options for all future tooltip instantiations
$.fn.tooltipster('setDefaults', {
  speed: 200,
});

$('.filter.contract-year .tooltip').tooltipster({
  functionInit() {
    return $(this).attr('aria-label');
  },
});

histogramDownloadLink.addEventListener('click', e => {
  e.preventDefault();
  histogramToImg(
    // TODO: We're reaching into a React component here, which isn't
    // a great idea. This should get cleaner once we make the download
    // link a React component too.
    $(histogramRoot).find('svg')[0],
    document.getElementById('graph')
  );
}, false);

form.on('submit', (data, e) => {
  e.preventDefault();
  formSynchronizer.reflectToStore(store);
  store.dispatch(invalidateRates());
});

/*
* For some reason, the browser's native form reset isn't working.
* So instead of just listening for a "reset" event and submitting,
* we hijack the click event on the reset button and reset the form
* manually.
*/
search.select('input[type="reset"]')
 .on('click', () => {
   d3.event.preventDefault();
   store.dispatch(resetState());
 });

initialize();

initReactApp({
  store,
  restoreExcludedRoot: $('#restore-excluded')[0],
  descriptionRoot: $('#description')[0],
  highlightsRoot: $('#highlights')[0],
  histogramRoot,
  proposedPriceRoot: $('#proposed-price')[0],
  educationLevelRoot: $('#education-level')[0],
  experienceRoot: $('#experience')[0],
});
