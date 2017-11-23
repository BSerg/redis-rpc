import uuid from 'uuid';
import _redis from 'redis';

let defaultOpts = {
    scope: 'rpc',
    redis: {
        host: 'localhost',
        port: 6379,
    }
}

export default class RPCClient {
    constructor(opts) {
        let _opts = {...defaultOpts, opts};
        this._id = uuid.v4();
        this.scope = _opts.scope;
        this.r = _redis.createClient(_opts.redis);
        this.callbacks = {};
        this.cancels = {};
    }

    _getQueue(queue) {
        return this.scope + ':' + queue;
    }

    on(queue, callback = (method, params) => {}) {
        this.cancels[queue] = null;
        let processQueue = this._getQueue(queue) + ':proc:' + this._id;
        let _process = (queue, callback) => {
            this.r.brpoplpush(this._getQueue(queue), processQueue, 0, (err, req) => {
                let request = JSON.parse(req);
                let respond = result => {
                    let response = {
                        jsonrpc: '2.0',
                        id: request.id,
                        ...result
                    };
                    this.r.lpush(this._getQueue(request.id), JSON.stringify(response));
                    this.r.rpop(processQueue);
                    this.cancels[queue] = setTimeout(() => {
                        _process(queue, callback);
                    }, 0);
                }
    
                callback(request.method, request.params).then(result => {
                    respond({result});
                }).catch(error => {
                    respond({error});
                });
            });
        };
        _process(queue, callback);
    }

    stop(queue) {
        clearTimeout(this.cancels[queue]);
    }

    call(queue, method, params, timeout = 300) {
        return new Promise((resolve, reject) => {
            let request = {
                jsonrpc: '2.0',
                id: uuid.v4(),
                method: method,
                params: params
            }
            this.r.lpush(this._getQueue(queue), JSON.stringify(request));
            this.r.brpop(this._getQueue(request.id), timeout, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    if (res == null) {
                        reject('Timeout');
                    } else {
                        let [_queue, _resData] = res;
                        let resData = JSON.parse(_resData);
                        if (resData.error) {
                            reject(err);
                        } else {
                            resolve(resData.result);
                        }
                    }
                    
                }
            });
        });
        
    }
}