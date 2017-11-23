import RPC from '../index';

test('Response from RPCServer on request "hello" must be "world"', async () => {
    let rpcServer = new RPC();
    let rpcClient = new RPC();

    rpcServer.on('hello', (method, params) => {
        return new Promise((resolve, reject) => {
            resolve('world');
        });
    });

    let res = await rpcClient.call('hello', 'justTest', ['some', 'params']);
    
    expect(res).toBe('world')
});
