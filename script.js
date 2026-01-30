(function () {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function initTheme() {
    const stored = localStorage.getItem('dvd.theme');
    if (stored === 'dark' || stored === 'light') {
      applyTheme(stored);
      return;
    }
    if (prefersDark && prefersDark.matches) {
      applyTheme('dark');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('dvd.theme', next);
  }

  const state = {
    data: {
      collection: [],
      wantlist: []
    },
    currentView: 'collection',
    pageSize: 100,
    currentPage: 1,
    searchQuery: ''
  };

  const statusEl = document.getElementById('status');
  const tablesContainer = document.getElementById('tables-container');
  const viewSelect = document.getElementById('view-select');
  const pageSizeSelect = document.getElementById('page-size');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');
  const lastUpdatedEl = document.getElementById('last-updated');
  const searchInput = document.getElementById('search');
  const countEl = document.getElementById('count');

  function setView(view) {
    state.currentView = view === 'wantlist' ? 'wantlist' : 'collection';
    state.currentPage = 1;

    if (viewSelect) {
      viewSelect.value = state.currentView;
    }

    const desktopToggle = document.querySelectorAll('.view-toggle-button');
    desktopToggle.forEach((btn) => {
      const btnView = btn.getAttribute('data-view');
      if (btnView === state.currentView) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });

    try {
      localStorage.setItem('dvd.view', state.currentView);
    } catch (e) {
      // ignore storage errors
    }

    render();
  }

  function initView() {
    let initial = 'collection';
    try {
      const stored = localStorage.getItem('dvd.view');
      if (stored === 'wantlist' || stored === 'collection') {
        initial = stored;
      }
    } catch (e) {
      // ignore storage errors
    }

    state.currentView = initial;

    if (viewSelect) {
      viewSelect.value = initial;
    }

    const desktopToggle = document.querySelectorAll('.view-toggle-button');
    desktopToggle.forEach((btn) => {
      const btnView = btn.getAttribute('data-view');
      btn.classList.toggle('is-active', btnView === state.currentView);
    });
  }

  function setupViewSwitch() {
    if (viewSelect) {
      viewSelect.addEventListener('change', () => {
        const next = viewSelect.value === 'wantlist' ? 'wantlist' : 'collection';
        setView(next);
      });
    }

    const desktopButtons = document.querySelectorAll('.view-toggle-button');
    desktopButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        setView(view === 'wantlist' ? 'wantlist' : 'collection');
      });
    });
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('error', !!isError);
  }

  async function loadData() {
    try {
      setStatus('Loading data…');
      const [collectionRes, wantlistRes] = await Promise.all([
        fetch('collection.json', { cache: 'no-store' }),
        fetch('wantlist.json', { cache: 'no-store' })
      ]);

      if (!collectionRes.ok && !wantlistRes.ok) {
        // Both files missing or not accessible: keep placeholder
        setStatus('No data yet. Make sure collection.json and wantlist.json exist.', true);
        return;
      }

      if (collectionRes.ok) {
        state.data.collection = await collectionRes.json();
      } else {
        state.data.collection = [];
      }

      if (wantlistRes.ok) {
        state.data.wantlist = await wantlistRes.json();
      } else {
        state.data.wantlist = [];
      }

      if (!Array.isArray(state.data.collection)) {
        state.data.collection = [];
      }
      if (!Array.isArray(state.data.wantlist)) {
        state.data.wantlist = [];
      }

      state.currentPage = 1;

      render();
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus('Error loading data. Please try again later.', true);
    }
  }

  function getCurrentDataset() {
    const base = state.data[state.currentView] || [];
    const q = (state.searchQuery || '').trim().toLowerCase();

    if (!q) {
      if (countEl) {
        const label = state.currentView === 'wantlist' ? 'item' : 'DVD';
        const n = base.length;
        countEl.textContent = `${n} ${label}${n === 1 ? '' : 's'}`;
      }
      return base;
    }

    const filtered = base.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const director = (item.director || '').toLowerCase();
      return title.includes(q) || director.includes(q);
    });

    if (countEl) {
      const label = state.currentView === 'wantlist' ? 'item' : 'DVD';
      const n = filtered.length;
      countEl.textContent = `${n} ${label}${n === 1 ? '' : 's'} found`;
    }

    return filtered;
  }

  function buildCategoryPages(dataset) {
    if (!dataset || dataset.length === 0) {
      return [];
    }

    const size = Number(state.pageSize) || 100;
    if (state.pageSize === 'all' || size <= 0) {
      return [dataset];
    }

    // Group full dataset by category in first-appearance order.
    const categoryOrder = [];
    const byCategory = new Map();

    for (const item of dataset) {
      const category = item.category || 'Uncategorized';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
        categoryOrder.push(category);
      }
      byCategory.get(category).push(item);
    }

    // Build pages out of whole category groups.
    const pages = [];
    let currentPageItems = [];
    let currentCount = 0;

    for (const category of categoryOrder) {
      const items = byCategory.get(category) || [];
      const catSize = items.length;

      if (currentPageItems.length === 0) {
        // First category on this page: always add, even if it exceeds size.
        currentPageItems = items.slice();
        currentCount = catSize;
        pages.push(currentPageItems);
        continue;
      }

      if (currentCount + catSize > size) {
        // Start a new page for this category.
        currentPageItems = items.slice();
        currentCount = catSize;
        pages.push(currentPageItems);
      } else {
        // Add this category to the current page.
        currentPageItems = currentPageItems.concat(items);
        currentCount += catSize;
        pages[pages.length - 1] = currentPageItems;
      }
    }

    return pages;
  }

  function getPageItems(dataset) {
    if (state.pageSize === 'all') {
      return dataset;
    }

    const pages = buildCategoryPages(dataset);
    if (pages.length === 0) {
      return [];
    }

    const pageIndex = Math.max(0, Math.min(state.currentPage - 1, pages.length - 1));
    return pages[pageIndex];
  }

  function groupByCategory(items) {
    const groups = new Map();
    for (const item of items) {
      const category = item.category || 'Uncategorized';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category).push(item);
    }
    return groups;
  }

  function renderTables() {
    const dataset = getCurrentDataset();
    const totalItems = dataset.length;

    if (totalItems === 0) {
      tablesContainer.innerHTML = '<p class="placeholder">No matching items.</p>';
      pageInfo.textContent = 'Page 1 of 1';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      if (lastUpdatedEl) {
        lastUpdatedEl.textContent = '';
      }
      return;
    }

    const pageItems = getPageItems(dataset);

    const containerFrag = document.createDocumentFragment();
    const groups = groupByCategory(pageItems);

    groups.forEach((items, category) => {
      const section = document.createElement('section');
      section.className = 'category-section';

      const heading = document.createElement('h2');
      heading.textContent = category;
      section.appendChild(heading);

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Title', 'Director'].forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      items.forEach((item) => {
        const tr = document.createElement('tr');

        const titleTd = document.createElement('td');
        titleTd.textContent = item.title || '';
        tr.appendChild(titleTd);

        const directorTd = document.createElement('td');
        directorTd.textContent = item.director || '';
        tr.appendChild(directorTd);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      section.appendChild(table);
      containerFrag.appendChild(section);
    });

    tablesContainer.innerHTML = '';
    tablesContainer.appendChild(containerFrag);

    updatePaginationControls(totalItems);

    if (lastUpdatedEl) {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      lastUpdatedEl.textContent = `Last synced: ${formatter.format(now)}`;
    }
  }

  function updatePaginationControls(totalItems) {
    if (state.pageSize === 'all' || totalItems === 0) {
      pageInfo.textContent = 'Page 1 of 1';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const dataset = getCurrentDataset();
    const pages = buildCategoryPages(dataset);
    const totalPages = pages.length || 1;

    if (state.currentPage > totalPages) {
      state.currentPage = totalPages;
    }

    pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
    prevBtn.disabled = state.currentPage <= 1;
    nextBtn.disabled = state.currentPage >= totalPages;
  }

  function render() {
    renderTables();
  }

  function onPageSizeChange(event) {
    const value = event.target.value;
    state.pageSize = value === 'all' ? 'all' : Number(value) || 100;
    state.currentPage = 1;
    render();
  }

  function onPrevPage() {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      render();
    }
  }

  function onNextPage() {
    const dataset = getCurrentDataset();
    const totalItems = dataset.length;
    const size = state.pageSize === 'all' ? totalItems : Number(state.pageSize) || 100;
    const totalPages = state.pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalItems / size));

    if (state.currentPage < totalPages) {
      state.currentPage += 1;
      render();
    }
  }

  function initEventListeners() {
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', onPageSizeChange);
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', onPrevPage);
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', onNextPage);
    }
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        state.searchQuery = event.target.value || '';
        state.currentPage = 1;
        render();
      });
    }

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initView();
    setupViewSwitch();
    initEventListeners();
    loadData();
  });
})();
