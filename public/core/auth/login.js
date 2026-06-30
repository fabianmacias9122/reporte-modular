import { fetchCatalogs } from '../../features/catalogos/data/catalogos.repository.js';
import {
  clearStoredSession,
  hasCoordinatorAccess,
  loginWithPassword,
  lookupAuthUser,
  normalizeUsername,
  restoreStoredSession,
  setPassword,
  setStoredSession,
} from './index.js';
import { t } from '../../i18n.js';

function getCellForPerson(catalogs, personId) {
  const safePersonId = String(personId || '').trim();
  if (!safePersonId) return null;
  const cells = catalogs && Array.isArray(catalogs.cells) ? catalogs.cells : [];
  const cell = cells.find((entry) => (
    String(entry && entry.leaderPersonId || '').trim() === safePersonId
    || String(entry && entry.assistantPersonId || '').trim() === safePersonId
  ));
  return cell ? String(cell.cellNumber || '').trim() || null : null;
}

function setVisibility(element, isVisible) {
  if (!element) return;
  element.hidden = !isVisible;
}

function getInputValue(element) {
  return element instanceof HTMLInputElement ? element.value : '';
}

function getLookupPersonId(lookup) {
  return lookup && lookup.personId ? String(lookup.personId) : '';
}

function rebuildStoredUser(catalogs, storedUser) {
  const personId = String(storedUser?.personId || '').trim();
  if (!personId) return storedUser;
  const people = catalogs && Array.isArray(catalogs.people) ? catalogs.people : [];
  const systemPeople = catalogs && Array.isArray(catalogs.systemPeople) ? catalogs.systemPeople : [];
  const person = people.find((entry) => String(entry && entry.id || '') === personId)
    || systemPeople.find((entry) => String(entry && entry.id || '') === personId);
  if (!person) return storedUser;

  const ownedCellNumber = getCellForPerson(catalogs, person.id);
  const assignedCellNumber = hasCoordinatorAccess(person) || person.supervisorSector
    ? (ownedCellNumber || null)
    : (ownedCellNumber || person.assignedCellNumber || null);
  const viaMaster = Boolean(storedUser?.viaMaster);

  return {
    ...storedUser,
    personId: person.id,
    name: person.name,
    role: person.role,
    assignedCellNumber,
    supervisedSector: person.supervisorSector || null,
    isCoordinator: hasCoordinatorAccess(person),
    isAdmin: Boolean(hasCoordinatorAccess(person) || person.isAdmin || person.isSystemAccount || viaMaster),
    isSupervisor: Boolean(person.supervisorSector),
    isSystemAccount: Boolean(person.isSystemAccount || viaMaster),
  };
}

export function createLoginExperience(options = {}) {
  const root = options.root || document;
  const overlay = root.querySelector('#login-overlay');
  const loginCard = overlay ? overlay.querySelector('.login-card') : null;
  const usernameInput = root.querySelector('#login-username');
  const passwordField = root.querySelector('#login-password-field');
  const passwordInput = root.querySelector('#login-password');
  const passwordConfirmField = root.querySelector('#login-password-confirm-field');
  const passwordConfirmInput = root.querySelector('#login-password-confirm');
  const passwordLabel = root.querySelector('#login-password-label');
  const helpText = root.querySelector('#login-help');
  const errorText = root.querySelector('#login-error');
  const loginButton = root.querySelector('#login-btn');

  let initialized = false;
  let catalogsPromise = null;
  let loginAuthMode = 'none';
  let loginLookupResult = null;
  let pendingResolver = null;
  let lookupRefreshTimer = null;
  let lookupRefreshSeq = 0;

  function setLoginError(message) {
    if (!errorText) return;
    errorText.textContent = message || '';
    errorText.hidden = !message;
  }

  function setLoginHelp(message) {
    if (!helpText) return;
    helpText.textContent = message || '';
    helpText.hidden = !message;
  }

  function setBusy(isBusy, buttonText = t('login.enter')) {
    if (loginCard) {
      if (isBusy) loginCard.setAttribute('aria-busy', 'true');
      else loginCard.removeAttribute('aria-busy');
    }
    if (loginButton instanceof HTMLButtonElement) {
      loginButton.disabled = isBusy || !String(getInputValue(usernameInput) || '').trim();
      loginButton.textContent = buttonText;
    }
  }

  async function ensureCatalogsLoaded() {
    if (!catalogsPromise) {
      catalogsPromise = fetchCatalogs();
    }
    return catalogsPromise;
  }

  function buildUser(catalogs, lookup, loginResult) {
    const lookupPersonId = getLookupPersonId(lookup);
    const people = catalogs && Array.isArray(catalogs.people) ? catalogs.people : [];
    const systemPeople = catalogs && Array.isArray(catalogs.systemPeople) ? catalogs.systemPeople : [];
    const person = people.find((entry) => String(entry && entry.id || '') === lookupPersonId)
      || systemPeople.find((entry) => String(entry && entry.id || '') === lookupPersonId);
    if (!person) {
      throw new Error('No se encontro la persona asociada al usuario.');
    }
    const viaMaster = Boolean(loginResult && loginResult.viaMaster);
    const ownedCellNumber = getCellForPerson(catalogs, person.id);
    const assignedCellNumber = hasCoordinatorAccess(person) || person.supervisorSector
      ? (ownedCellNumber || null)
      : (ownedCellNumber || person.assignedCellNumber || null);
    return {
      personId: person.id,
      name: person.name,
      role: person.role,
      assignedCellNumber,
      supervisedSector: person.supervisorSector || null,
      isCoordinator: hasCoordinatorAccess(person),
      isAdmin: Boolean(hasCoordinatorAccess(person) || person.isAdmin || person.isSystemAccount || viaMaster),
      isSupervisor: Boolean(person.supervisorSector),
      isSystemAccount: Boolean(person.isSystemAccount || viaMaster),
      viaMaster,
      visitCount: Number(loginResult && loginResult.visitCount !== undefined && loginResult.visitCount !== null
        ? loginResult.visitCount
        : (person.visitCount !== undefined && person.visitCount !== null ? person.visitCount : 0)),
    };
  }

  async function refreshLoginPasswordUI() {
    const refreshSeq = ++lookupRefreshSeq;
    setLoginError('');
    if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
    if (passwordConfirmInput instanceof HTMLInputElement) passwordConfirmInput.value = '';
    loginLookupResult = null;
    const username = normalizeUsername(getInputValue(usernameInput));
    if (!username) {
      loginAuthMode = 'none';
      setVisibility(passwordField, false);
      setVisibility(passwordConfirmField, false);
      setLoginHelp('');
      if (loginButton instanceof HTMLButtonElement) loginButton.disabled = true;
      return;
    }

    try {
      const lookupResponse = await lookupAuthUser(username);
      if (refreshSeq !== lookupRefreshSeq) {
        return;
      }
      if (username !== normalizeUsername(getInputValue(usernameInput))) {
        return;
      }
      if (!lookupResponse.found || !lookupResponse.data) {
        loginAuthMode = 'none';
        setVisibility(passwordField, false);
        setVisibility(passwordConfirmField, false);
        setLoginHelp('');
        setLoginError('Usuario no encontrado.');
        if (loginButton instanceof HTMLButtonElement) loginButton.disabled = true;
        return;
      }

      const data = lookupResponse.data;
      loginLookupResult = data;
      if (data.hasPassword && !data.mustChange) {
        loginAuthMode = 'enter';
        if (passwordLabel) passwordLabel.textContent = `Contraseña de ${data.name}`;
        setVisibility(passwordField, true);
        setVisibility(passwordConfirmField, false);
        setLoginHelp('');
      } else if (data.mustChange) {
        loginAuthMode = 'reset';
        if (passwordLabel) passwordLabel.textContent = `Crea una contraseña nueva para ${data.name}`;
        setVisibility(passwordField, true);
        setVisibility(passwordConfirmField, true);
        setLoginHelp('Debes actualizar tu contraseña antes de entrar.');
      } else {
        loginAuthMode = 'create';
        if (passwordLabel) passwordLabel.textContent = `Crea una contraseña para ${data.name}`;
        setVisibility(passwordField, true);
        setVisibility(passwordConfirmField, true);
        setLoginHelp('Primer ingreso: puedes crear una contraseña ahora o entrar sin contraseña y configurarla después.');
      }
      if (loginButton instanceof HTMLButtonElement) loginButton.disabled = false;
    } catch (_error) {
      setLoginError('No se pudo conectar con el servidor.');
      if (loginButton instanceof HTMLButtonElement) loginButton.disabled = true;
    }
  }

  function scheduleLoginPasswordRefresh() {
    if (lookupRefreshTimer) {
      clearTimeout(lookupRefreshTimer);
    }
    const username = normalizeUsername(getInputValue(usernameInput));
    if (!username) {
      return;
    }
    lookupRefreshTimer = setTimeout(() => {
      lookupRefreshTimer = null;
      refreshLoginPasswordUI();
    }, 180);
  }

  async function resolveLoginResult() {
    if (!loginLookupResult) {
      await refreshLoginPasswordUI();
      if (!loginLookupResult) return null;
    }

    const username = normalizeUsername(getInputValue(usernameInput));
    const lookup = loginLookupResult;
    if (!username || !lookup) return null;

    if (loginAuthMode === 'enter') {
      const password = String(getInputValue(passwordInput) || '');
      if (!password) {
        throw new Error('Ingresa tu contraseña.');
      }
      return loginWithPassword({ username, password });
    }

    if (loginAuthMode === 'create' || loginAuthMode === 'reset') {
      const password = String(getInputValue(passwordInput) || '');
      const passwordConfirm = String(getInputValue(passwordConfirmInput) || '');
      if (loginAuthMode === 'create' && !password && !passwordConfirm) {
        return loginWithPassword({ personId: lookup.personId });
      }
      if (password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres.');
      }
      if (password !== passwordConfirm) {
        throw new Error('Las contraseñas no coinciden.');
      }
      await setPassword({ personId: lookup.personId, newPassword: password });
      return loginWithPassword({ personId: lookup.personId, password });
    }

    return loginWithPassword({ personId: lookup.personId });
  }

  async function handleLogin() {
    try {
      setLoginError('');
      const catalogs = await ensureCatalogsLoaded();
      const loginResult = await resolveLoginResult();
      if (!loginResult) return;
      const user = buildUser(catalogs, loginLookupResult, loginResult);
      setStoredSession(user);
      setBusy(true, 'Cargando...');
      if (typeof pendingResolver === 'function') {
        pendingResolver(user);
      }
      pendingResolver = null;
    } catch (error) {
      setBusy(false, t('login.enter'));
      setLoginError(error instanceof Error ? error.message : 'No se pudo iniciar sesión.');
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    setVisibility(passwordField, false);
    setVisibility(passwordConfirmField, false);
    setLoginHelp('');
    setLoginError('');
    if (loginButton instanceof HTMLButtonElement) {
      loginButton.disabled = true;
      loginButton.addEventListener('click', () => {
        handleLogin();
      });
    }
    if (usernameInput instanceof HTMLInputElement) {
      usernameInput.addEventListener('input', () => {
        loginAuthMode = 'none';
        loginLookupResult = null;
        lookupRefreshSeq += 1;
        if (lookupRefreshTimer) {
          clearTimeout(lookupRefreshTimer);
          lookupRefreshTimer = null;
        }
        setVisibility(passwordField, false);
        setVisibility(passwordConfirmField, false);
        setLoginHelp('');
        setLoginError('');
        if (loginButton instanceof HTMLButtonElement) {
          loginButton.disabled = !String(usernameInput.value || '').trim();
        }
        scheduleLoginPasswordRefresh();
      });
      usernameInput.addEventListener('change', () => {
        refreshLoginPasswordUI();
      });
      usernameInput.addEventListener('blur', () => {
        refreshLoginPasswordUI();
      });
      usernameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          refreshLoginPasswordUI().then(() => {
            if ((loginAuthMode === 'enter' || loginAuthMode === 'create' || loginAuthMode === 'reset') && passwordInput instanceof HTMLInputElement && passwordField && !passwordField.hidden) {
              passwordInput.focus();
              return;
            }
            if (loginButton instanceof HTMLButtonElement && !loginButton.disabled) {
              loginButton.focus();
            }
          });
          return;
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        refreshLoginPasswordUI().then(() => {
          if ((loginAuthMode === 'enter' || loginAuthMode === 'create' || loginAuthMode === 'reset') && passwordInput instanceof HTMLInputElement) {
            passwordInput.focus();
          } else if (loginButton instanceof HTMLButtonElement && !loginButton.disabled) {
            loginButton.click();
          }
        });
      });
    }
    [passwordInput, passwordConfirmInput].forEach((element) => {
      if (!(element instanceof HTMLInputElement)) return;
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (loginButton instanceof HTMLButtonElement && !loginButton.disabled) {
          loginButton.click();
        }
      });
    });
  }

  function show() {
    if (overlay) overlay.classList.remove('is-hidden');
  }

  function hide() {
    if (overlay) overlay.classList.add('is-hidden');
    setBusy(false, t('login.enter'));
  }

  async function resolveSession() {
    init();
    const storedUser = restoreStoredSession();
    if (storedUser) {
      try {
        const catalogs = await ensureCatalogsLoaded();
        const refreshedUser = rebuildStoredUser(catalogs, storedUser);
        setStoredSession(refreshedUser);
        hide();
        return refreshedUser;
      } catch {
        // If the catalog refresh fails, keep the last stored session so login is still usable offline-ish.
      }
      hide();
      return storedUser;
    }
    show();
    return new Promise((resolve) => {
      pendingResolver = resolve;
    });
  }

  function reset() {
    clearStoredSession();
    loginLookupResult = null;
    loginAuthMode = 'none';
    lookupRefreshSeq += 1;
    if (lookupRefreshTimer) {
      clearTimeout(lookupRefreshTimer);
      lookupRefreshTimer = null;
    }
    if (usernameInput instanceof HTMLInputElement) usernameInput.value = '';
    if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
    if (passwordConfirmInput instanceof HTMLInputElement) passwordConfirmInput.value = '';
    setVisibility(passwordField, false);
    setVisibility(passwordConfirmField, false);
    setLoginHelp('');
    setLoginError('');
    setBusy(false, t('login.enter'));
    show();
  }

  return {
    hide,
    init,
    reset,
    resolveSession,
    show,
  };
}