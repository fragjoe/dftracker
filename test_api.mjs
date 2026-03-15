// Use native fetch

async function test() {
    const headers = { 'Connect-Protocol-Version': '1', 'Content-Type': 'application/json' };

    // 1. Get an item
    console.log('Fetching items...');
    const res1 = await fetch('https://api.deltaforceapi.com/deltaforceapi.gateway.v1.ApiService/ListAuctionItems', {
        method: 'POST',
        headers,
        body: JSON.stringify({ pageSize: 1 })
    });
    const data1 = await res1.json();
    const item = data1.items[0];
    console.log('Got item:', item.name, item.id);

    // 2. Test GetAuctionItemPrices
    console.log('Testing GetAuctionItemPrices...');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
        const res2 = await fetch('https://api.deltaforceapi.com/deltaforceapi.gateway.v1.ApiService/GetAuctionItemPrices', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                auctionItemId: item.id,
                pageSize: 10,
                startTime: thirtyDaysAgo.toISOString(),
                endTime: now.toISOString()
            })
        });
        console.log('Prices status:', res2.status);
        const data2 = await res2.json();
        console.log('Prices data:', JSON.stringify(data2).substring(0, 200));
    } catch (e) { console.error('Error:', e.message); }

    // 3. Test GetAuctionItemPriceSeries
    console.log('Testing GetAuctionItemPriceSeries...');
    try {
        const res3 = await fetch('https://api.deltaforceapi.com/deltaforceapi.gateway.v1.ApiService/GetAuctionItemPriceSeries', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                auctionItemId: item.id,
                startTime: thirtyDaysAgo.toISOString(),
                endTime: now.toISOString(),
                interval: 'INTERVAL_DAY'
            })
        });
        console.log('Series status:', res3.status);
        const data3 = await res3.json();
        console.log('Series data keys:', Object.keys(data3));
        console.log('Series data:', JSON.stringify(data3).substring(0, 200));
    } catch (e) { console.error('Error:', e.message); }
}

test();
