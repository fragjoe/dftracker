import urllib.request
import json
import datetime

url_base = 'https://api.deltaforceapi.com/deltaforceapi.gateway.v1.ApiService/'
headers = {'Connect-Protocol-Version': '1', 'Content-Type': 'application/json'}

def post(endpoint, body):
    req = urllib.request.Request(url_base + endpoint, data=json.dumps(body).encode('utf-8'), headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            result = r.read()
            return json.loads(result)
    except urllib.error.HTTPError as e:
        print(f"Error {endpoint}: {e.code} {e.reason}\n{e.read().decode('utf-8')}")
        return None

print("Fetching item...")
item_data = post('ListAuctionItems', {'pageSize': 1})
if item_data:
    item = item_data.get('items', [{}])[0]
    item_id = item.get('id')
    print(f"Item ID: {item_id}")
    
    thirty_days_ago = (datetime.datetime.utcnow() - datetime.timedelta(days=30)).isoformat() + "Z"
    now = datetime.datetime.utcnow().isoformat() + "Z"
    
    print("\nFetching historical prices...")
    price_data = post('GetAuctionItemPrices', {
        'auctionItemId': item_id,
        'pageSize': 10,
        'startTime': thirty_days_ago,
        'endTime': now
    })
    if price_data:
        print(f"Price response keys: {list(price_data.keys())}")
        print(f"First price entry: {price_data.get('items', [{}])[0]}")
    
    print("\nFetching price series...")
    series_data = post('GetAuctionItemPriceSeries', {
        'auctionItemId': item_id,
        'startTime': thirty_days_ago,
        'endTime': now,
        'interval': 'INTERVAL_DAY'
    })
    if series_data:
        print(f"Series response keys: {list(series_data.keys())}")
        print(f"First series entry: {series_data.get('series', [{}])[0]}")
