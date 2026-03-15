import urllib.request
import json

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

items_data = post('ListAuctionItems', {'pageSize': 1, 'language': 'LANGUAGE_EN', 'filter': 'lang_en : "M4A1"'})
if items_data:
    item = items_data.get('items', [{}])[0]
    print(f"ListAuctionItems Keys: {item.keys()}")
    item_id = item.get('id')

    # Now get the specific item data
    item_detail = post('GetAuctionItem', {'id': item_id, 'language': 'LANGUAGE_EN'})
    if item_detail:
        print(f"GetAuctionItem Keys: {item_detail.keys()}")
        item_obj = item_detail.get('item', {})
        print(f"Item Object Keys: {item_obj.keys()}")
        print(f"Current Price in item obj: {item_obj.get('priceCurrent')}")
        print(f"Reference Price in item obj: {item_obj.get('priceReference')}")
