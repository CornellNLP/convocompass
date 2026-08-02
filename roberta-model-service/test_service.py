"""
simple test script to verify roberta service is working
"""
import requests
import json

# configuration
SERVICE_URL = "http://localhost:8085"

def test_health():
    """test health endpoint"""
    print("[test] checking health endpoint...")
    response = requests.get(f"{SERVICE_URL}/health")
    print(f"[result] status: {response.status_code}")
    print(f"[result] response: {response.json()}")
    assert response.status_code == 200
    print("[pass] health check passed\n")


def test_score():
    """test score endpoint"""
    print("[test] testing score endpoint...")
    
    # sample conversation
    test_data = {
        "existing": [
            {"id": "1", "text": "hello, how are you doing today?"},
            {"id": "2", "text": "im doing great, thanks for asking!"}
        ],
        "new": "thats wonderful to hear!"
    }
    
    response = requests.post(
        f"{SERVICE_URL}/score",
        json=test_data,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"[result] status: {response.status_code}")
    print(f"[result] response: {json.dumps(response.json(), indent=2)}")
    
    assert response.status_code == 200
    result = response.json()
    assert "scores" in result
    assert "1" in result["scores"]
    assert "2" in result["scores"]
    assert "new" in result["scores"]
    
    print("[pass] score test passed\n")


def test_score_batch():
    """test batch scoring endpoint"""
    print("[test] testing batch score endpoint...")
    
    test_data = {
        "conversations": [
            {
                "existing": [
                    {"id": "a1", "text": "first conversation"},
                    {"id": "a2", "text": "second message"}
                ],
                "new": "third message"
            },
            {
                "existing": [
                    {"id": "b1", "text": "another conversation"},
                    {"id": "b2", "text": "another message"}
                ],
                "new": None
            }
        ]
    }
    
    response = requests.post(
        f"{SERVICE_URL}/score_batch",
        json=test_data,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"[result] status: {response.status_code}")
    print(f"[result] response: {json.dumps(response.json(), indent=2)}")
    
    assert response.status_code == 200
    result = response.json()
    assert "results" in result
    assert len(result["results"]) == 2
    
    print("[pass] batch score test passed\n")


if __name__ == "__main__":
    print("\n=== roberta model service tests ===\n")
    
    try:
        test_health()
        test_score()
        test_score_batch()
        print("\n[success] all tests passed!")
    except AssertionError as e:
        print(f"\n[fail] test failed: {e}")
    except requests.exceptions.ConnectionError:
        print(f"\n[error] could not connect to service at {SERVICE_URL}")
        print("[error] make sure the service is running")
    except Exception as e:
        print(f"\n[error] unexpected error: {e}")
