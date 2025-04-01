from web3 import Web3
import json

# Connect to Ganache
ganache_url = "http://ganache:8545"
web3 = Web3(Web3.HTTPProvider(ganache_url))

# Check if connection is successful
if web3.is_connected():
    print("Connected to Ethereum")
else:
    print("Failed to connect")

# Get the contract ABI and address
with open('/app/build/contracts/Tournament.json') as f:
    contract_json = json.load(f)
    contract_abi = contract_json['abi']

# Read contract address from file
with open('/app/build/contract_address.txt', 'r') as file:
    contract_address = file.read().replace('\n', '')
contract = web3.eth.contract(address=contract_address, abi=contract_abi)

# Set the default account
web3.eth.default_account = web3.eth.accounts[0]

def get_last_tournament():
    # Get all matches
    matches = contract.functions.getMatches().call()
    if matches:  # Check if there are any matches
        # Return the last match in the list
        last_match = matches[-1]
        return {
            "player_id_1": last_match[0],
            "player_id_2": last_match[1],
            "player_id_3": last_match[2],
            "player_id_4": last_match[3],
            "score_match_1_2": last_match[4],
            "score_match_3_4": last_match[5],
            "score_match_final": last_match[6]
        }
    else:
        return "No tournaments found"

# Get and print the last tournament
last_tournament = get_last_tournament()
if isinstance(last_tournament, dict):
    print("Last Tournament:")
    for key, value in last_tournament.items():
        print(f"{key}: {value}")
else:
    print(last_tournament)