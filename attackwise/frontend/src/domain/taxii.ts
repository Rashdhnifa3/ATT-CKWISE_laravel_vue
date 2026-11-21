// Port of nav-app/src/app/utils/taxii2lib.ts (TAXII 2.0/2.1 client, MIT-licensed taxii2lib by
// R. Wathelet, modified by I. Tuson and C. Miller for ATT&CK Navigator), reduced to the one path the
// reference uses: DataService.getDomainData → new TaxiiConnect(url, '', '') →
// new Collection({id, can_read: true}, url, conn).getObjects('', undefined).
// Behaviour kept on purpose (reference semantics, see CURRENT_PARITY.md D04):
//   - credentials are always empty, so the header is `Authorization: Basic Og==`
//     (config `authentication` is NOT applied to TAXII sources);
//   - `Accept: application/taxii+json;version=2.1` and a `version: 2.1` header, path
//     `{taxii_url}api/v21/collections/{id}/objects/`; for cti-taxii.mitre.org, STIX 2.0 media type and
//     `{taxii_url}stix/collections/{id}/objects/`;
//   - 10 s timeout; the HTTP status is not checked (the body is parsed as JSON whatever the status),
//     only the first page is read (no `more`/`next` pagination).

/* eslint-disable @typescript-eslint/no-explicit-any */
export class TaxiiConnect {
    readonly baseURL: string;
    readonly hash: string;
    readonly version: string;
    readonly mediaType: string;

    constructor(
        url: string,
        user: string,
        password: string,
        readonly timeout = 10000,
        private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)
    ) {
        this.baseURL = TaxiiConnect.withoutLastSlash(url);
        this.hash = btoa(user + ':' + password);
        this.version = '2.1';
        this.mediaType = `application/taxii+json;version=${this.version}`;
        if (url.includes('cti-taxii.mitre.org')) {
            this.version = '2.0';
            this.mediaType = 'application/vnd.oasis.stix+json';
        }
    }

    get headers(): Record<string, string> {
        return { Accept: this.mediaType, version: this.version, Authorization: 'Basic ' + this.hash };
    }

    async asyncFetch(path: string, init: RequestInit): Promise<any> {
        try {
            const res = await new Promise<Response>((resolve, reject) => {
                setTimeout(() => reject('connection timeout'), this.timeout);
                this.fetcher(path, init).then(resolve, reject);
            });
            return await res.json();
        } catch (err) {
            throw new Error('fetch error: ' + err);
        }
    }

    static withoutLastSlash(url: string) {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }
    static withLastSlash(url: string) {
        return url.endsWith('/') ? url : url + '/';
    }
}

export class Collection {
    readonly path: string;

    constructor(
        collectionId: string,
        apiRootPath: string,
        private readonly conn: TaxiiConnect
    ) {
        let root = TaxiiConnect.withLastSlash(apiRootPath + 'api/v21');
        if (apiRootPath.includes('cti-taxii.mitre.org')) root = TaxiiConnect.withLastSlash(apiRootPath + 'stix');
        this.path = root + 'collections/' + collectionId + '/';
    }

    /** One GET of `{path}objects/`; resolves to the parsed JSON body (a TAXII envelope or bundle). */
    getObjects(): Promise<any> {
        return this.conn.asyncFetch(this.path + 'objects/', { method: 'get', headers: this.conn.headers });
    }
}
