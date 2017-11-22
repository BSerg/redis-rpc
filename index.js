import redis from 'redis';
import uuid from 'uuid';

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
        this.redis = redis.createClient(_opts.redis);
        this.callbacks = {};
        this.cancels = {};

        this.init();
    }

    _getQueue(queue) {
        return this.scope + ':' + queue;
    }

    on(queue, callback = (method, params) => {}) {
        this.cancels[queue] = null;
        let processQueue = this._getQueue(queue) + ':proc:' + this._id;
        this.redis.brpoplpush(this._getQueue(queue), processQueue, (err, req) => {

            let respond = res => {
                let response = {
                    jsonrpc: '2.0',
                    id: req.id,
                    ...res
                };
                this.redis.lpush(this._getQueue(req.id), JSON.stringify(response));
                this.redis.rpop(processQueue);
                this.cancels[queue] = setTimeout(() => {
                    this.processQueue(queue, callback);
                }, 0);
            }

            callback(req.method, req.params).then(result => {
                respond({result});
            }).catch(error => {
                respond({error});
            });
        });
    }

    stop(queue) {
        clearTimeout(this.cancels[queue]);
    }

    call(queue, method, params) {
        return new Promise((resolve, reject) => {
            let request = {
                jsonrpc: '2.0',
                id: uuid.v4(),
                method: method,
                params: params
            }
            this.redis.lpush(this._getQueue(queue), JSON.stringify(request));
            this.redis.brpop(this._getQueue(request.id), 600, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    let resData = JSON.parse(res);
                    if (resData.error) {
                        reject(err);
                    } else {
                        resolve(resData.result);
                    }
                }
            });
        });
        
    }
}