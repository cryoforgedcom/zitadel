'use client';

import { useEffect, useState } from 'react';

export default function AuthRequestForm() {
  const [instance, setInstance] = useState('https://zitadel-instance-abcdef.zitadel.cloud');
  const [clientId, setClientId] = useState('123456789012345678@yourproject');
  const [redirectUri, setRedirectUri] = useState('https://yourapp.com/auth/callback');
  const [responseType, setResponseType] = useState('code');
  const [scope, setScope] = useState('openid email profile');
  const [prompt, setPrompt] = useState('');
  const [authMethod, setAuthMethod] = useState('(none) PKCE');
  const [codeVerifier, setCodeVerifier] = useState('');
  const [codeChallenge, setCodeChallenge] = useState('');
  const [loginHint, setLoginHint] = useState('');
  const [idTokenHint, setIdTokenHint] = useState('');
  const [organizationId, setOrganizationId] = useState('');

  const inputClasses =
    'w-full text-sm h-10 rounded-md p-2 bg-white dark:bg-neutral-800 transition-colors duration-300 border border-solid border-neutral-300 dark:border-neutral-600 hover:border-black hover:dark:border-white focus:border-blue-500 focus:dark:border-blue-400 focus:outline-none focus:ring-0 text-base text-black dark:text-white placeholder:italic placeholder-neutral-500 dark:placeholder-neutral-500';

  const labelClasses = 'block text-sm font-medium text-black dark:text-white mb-1';
  const hintClasses = 'mt-1 text-xs text-black/50 dark:text-white/50';

  const allResponseTypes = ['code', 'id_token', 'id_token token'];
  const allPrompts = ['', 'login', 'select_account', 'create', 'none'];
  const allAuthMethods = ['(none) PKCE', 'Client Secret Basic'];

  const allScopes = [
    'openid',
    'email',
    'profile',
    'address',
    'offline_access',
    'urn:zitadel:iam:org:project:id:zitadel:aud',
    'urn:zitadel:iam:user:metadata',
    `urn:zitadel:iam:org:id:${organizationId ? organizationId : '[organizationId]'}`,
  ];

  const [scopeState, setScopeState] = useState([true, true, true, false, false, false, false, false]);

  function toggleScope(position: number) {
    const updatedCheckedState = scopeState.map((item: boolean, index: number) => (index === position ? !item : item));
    setScopeState(updatedCheckedState);
    setScope(
      updatedCheckedState
        .map((checked: boolean, i: number) => (checked ? allScopes[i] : ''))
        .filter((s: string) => !!s)
        .join(' '),
    );
  }

  async function string_to_sha256(message: string) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return hashBuffer;
  }

  async function encodeCodeChallenge(verifier: string) {
    const arrayBuffer = await string_to_sha256(verifier);
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return base64url;
  }

  function generateRandomString() {
    const array = new Uint32Array(56 / 2);
    window.crypto.getRandomValues(array);
    return Array.from(array, (dec) => ('0' + dec.toString(16)).substr(-2)).join('');
  }

  async function generateCodeChallenge() {
    const verifier = generateRandomString();
    setCodeVerifier(verifier);
    const challenge = await encodeCodeChallenge(verifier);
    setCodeChallenge(challenge);
  }

  useEffect(() => {
    if (!codeVerifier && !codeChallenge) {
      generateCodeChallenge();
    }
  }, [codeVerifier, codeChallenge]);

  const authUrl = () => {
    const params = new URLSearchParams();
    if (clientId) params.append('client_id', clientId);
    if (redirectUri) params.append('redirect_uri', redirectUri);
    if (responseType) params.append('response_type', responseType);
    if (scope) params.append('scope', scope);
    if (prompt) params.append('prompt', prompt);
    if (loginHint) params.append('login_hint', loginHint);
    if (idTokenHint) params.append('id_token_hint', idTokenHint);
    if (organizationId) params.append('organization', organizationId);
    if (authMethod === '(none) PKCE' && codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }
    const base = instance.endsWith('/') ? instance : instance + '/';
    return `${base}oauth/v2/authorize?${params.toString()}`;
  };

  return (
    <div className="not-prose my-8 rounded-lg border border-neutral-200 bg-neutral-50 p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-6 text-xl font-bold text-neutral-900 dark:text-white">OIDC Authorization Request Builder</h3>

      <div className="space-y-5">
        {/* Instance URL */}
        <div>
          <label className={labelClasses}>
            <span className="text-yellow-600 dark:text-yellow-400">Instance URL</span>
          </label>
          <input
            type="text"
            className={inputClasses}
            placeholder="https://zitadel-instance-abcdef.zitadel.cloud"
            value={instance}
            onChange={(e) => setInstance(e.target.value)}
          />
          <div className={hintClasses}>Your ZITADEL instance domain</div>
        </div>

        <h4 className="!mt-6 text-base font-semibold text-neutral-900 dark:text-white">Required Parameters</h4>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Client ID */}
          <div>
            <label className={labelClasses}>
              <span className="text-green-600 dark:text-green-400">Client ID</span>
            </label>
            <input
              type="text"
              className={inputClasses}
              placeholder="123456789@project"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
            <div className={hintClasses}>The client identifier issued to the client</div>
          </div>

          {/* Redirect URI */}
          <div>
            <label className={labelClasses}>
              <span className="text-blue-600 dark:text-blue-400">Redirect URI</span>
            </label>
            <input
              type="text"
              className={inputClasses}
              placeholder="https://yourapp.com/auth/callback"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
            />
            <div className={hintClasses}>URI to redirect to after authorization</div>
          </div>

          {/* Response Type */}
          <div>
            <label className={labelClasses}>
              <span className="text-orange-600 dark:text-orange-400">Response Type</span>
            </label>
            <select className={inputClasses} value={responseType} onChange={(e) => setResponseType(e.target.value)}>
              {allResponseTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <div className={hintClasses}>Determines the authorization processing flow</div>
          </div>
        </div>

        <h4 className="!mt-6 text-base font-semibold text-neutral-900 dark:text-white">Authentication Method</h4>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Auth Method */}
          <div>
            <label className={labelClasses}>
              <span className="text-teal-600 dark:text-teal-400">Authentication Method</span>
            </label>
            <select className={inputClasses} value={authMethod} onChange={(e) => setAuthMethod(e.target.value)}>
              {allAuthMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <div className={hintClasses}>Client authentication method</div>
          </div>

          {/* PKCE fields */}
          {authMethod === '(none) PKCE' && (
            <>
              <div>
                <label className={labelClasses}>
                  <span className="text-teal-600 dark:text-teal-400">Code Verifier</span>
                </label>
                <input
                  type="text"
                  className={inputClasses}
                  value={codeVerifier}
                  onChange={(e) => setCodeVerifier(e.target.value)}
                  placeholder="Generated automatically"
                />
                <div className={hintClasses}>High-entropy cryptographic random string</div>
              </div>

              <div>
                <label className={labelClasses}>Code Challenge</label>
                <input
                  type="text"
                  className={inputClasses}
                  value={codeChallenge}
                  onChange={(e) => setCodeChallenge(e.target.value)}
                  placeholder="Generated automatically"
                  readOnly
                />
                <div className={hintClasses}>Base64url-encoded SHA256 hash of the code verifier</div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={generateCodeChallenge}
                  className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
                >
                  Generate New PKCE Pair
                </button>
              </div>
            </>
          )}
        </div>

        <h4 className="!mt-6 text-base font-semibold text-neutral-900 dark:text-white">Additional Parameters</h4>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Prompt */}
          <div>
            <label className={labelClasses}>
              <span className="text-cyan-600 dark:text-cyan-400">Prompt</span>
            </label>
            <select className={inputClasses} value={prompt} onChange={(e) => setPrompt(e.target.value)}>
              {allPrompts.map((promptValue) => (
                <option key={promptValue} value={promptValue}>
                  {promptValue || '(none)'}
                </option>
              ))}
            </select>
            <div className={hintClasses}>Specifies whether the user is prompted for reauthentication</div>
          </div>

          {/* Login Hint */}
          <div>
            <label className={labelClasses}>
              <span className="text-rose-600 dark:text-rose-400">Login Hint</span>
            </label>
            <input
              type="text"
              className={inputClasses}
              placeholder="user@example.com"
              value={loginHint}
              onChange={(e) => setLoginHint(e.target.value)}
            />
            <div className={hintClasses}>Hint about the user&apos;s identity</div>
          </div>

          {/* ID Token Hint */}
          <div>
            <label className={labelClasses}>ID Token Hint</label>
            <input
              type="text"
              className={inputClasses}
              placeholder="eyJhbGciOiJSUzI1NiJ9..."
              value={idTokenHint}
              onChange={(e) => setIdTokenHint(e.target.value)}
            />
            <div className={hintClasses}>Previously issued ID token</div>
          </div>
        </div>

        <h4 className="!mt-6 text-base font-semibold text-neutral-900 dark:text-white">Scopes</h4>

        {/* Organization ID */}
        <div className="max-w-md">
          <label className={labelClasses}>
            <span className="text-purple-600 dark:text-purple-400">Organization ID</span>
          </label>
          <input
            type="text"
            className={inputClasses}
            placeholder="168811945419506433"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          />
          <div className={hintClasses}>
            Enforce organization policies by requesting scope{' '}
            <code className="text-xs">urn:zitadel:iam:org:id:{organizationId || '{id}'}</code>
          </div>
        </div>

        {/* Scopes */}
        <div>
          <label className={`${labelClasses} text-purple-600 dark:text-purple-400`}>Scopes</label>
          <p className="mb-2 text-xs text-black/50 dark:text-white/50">
            Request additional information about the user with scopes.
          </p>
          <div className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {allScopes.map((scopeItem, index) => (
              <div key={scopeItem} className="flex items-center">
                <input
                  type="checkbox"
                  checked={scopeState[index]}
                  onChange={() => toggleScope(index)}
                  className="mr-2 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">{scopeItem}</span>
              </div>
            ))}
          </div>
          <input
            type="text"
            className={inputClasses}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="openid email profile"
          />
          <div className={hintClasses}>Space-separated list of scopes</div>
        </div>

        {/* Generated Auth URL */}
        <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <label className={labelClasses}>Generated Authorization URL</label>
          <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-sm break-all dark:border-neutral-600 dark:bg-neutral-900">
            {authUrl()}
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 flex justify-center">
          <a
            href={authUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-green-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 hover:text-white hover:no-underline"
          >
            Start Authorization Flow
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
