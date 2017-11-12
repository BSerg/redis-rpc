import redis from 'redis';
import uuid from 'uuid';


export default class RPCClient {
    constructor(redisConnectionOpts) {
        this.redisConnectionOpts = redisConnectionOpts
        this.callbacks = {};
        this.cancels = {};
        this.init();
    }

    init() {
        this.sub = redis.createClient(this.redisConnectionOpts);

        this.sub.on('message', (channel, msg) => {
            this.callbacks[channel] && this.callbacks[channel](msg);
        });

        this.pub = this.sub.duplicate();
    }

    call(channel, msg, _id) {
        return new Promise((resolve, reject) => {
            _id = _id || uuid.v4();
            this.callbacks[_id] = response => {
                delete this.callbacks[_id];
                delete this.cancels[_id];
                resolve(response);
            };
            this.cancels[_id] = () => {
                delete this.callbacks[_id];
                delete this.cancels[_id];
                reject({isCanceled: true});
            };
            this.sub.subscribe(_id);
            this.pub.publish(channel, JSON.stringify({msg, _id}));
        });
    }

    cancel(_id) {
        this.cancels[_id] && this.cancels[_id]();
    }

    cancelableCall(channel, msg) {
        const _id = uuid.v4();

        return {
            promise: () => {
                return this.call(channel, msg, _id);
            },
            cancel() {
                this.cancel(_id);
            }
        }
    }
}