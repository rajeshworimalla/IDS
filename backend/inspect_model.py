import joblib
import pickle

def inspect_model(model_path):
    try:
        # Try loading with joblib first
        try:
            model = joblib.load(model_path)
            print("Model loaded with joblib")
        except:
            # Fall back to pickle
            model = pickle.load(open(model_path, 'rb'))
            print("Model loaded with pickle")
        
        # Print model information
        print(f"Model type: {type(model)}")
        print(f"Model attributes: {dir(model)}")
        
        # Try to get feature names
        if hasattr(model, 'feature_names_in_'):
            print("\nFeature names in model:")
            print(model.feature_names_in_)
        else:
            print("\nModel does not have feature_names_in_ attribute")
            
        # Try to get feature names from other possible attributes
        if hasattr(model, 'feature_names'):
            print("\nFeature names (from feature_names):")
            print(model.feature_names)
        if hasattr(model, 'get_feature_names'):
            print("\nFeature names (from get_feature_names):")
            print(model.get_feature_names())
            
    except Exception as e:
        print(f"Error inspecting model: {e}")

if __name__ == '__main__':
    print("Inspecting binary model:")
    inspect_model('binary_attack_model.pkl')
    print("\nInspecting multiclass model:")
    inspect_model('multiclass_attack_model.pkl') 