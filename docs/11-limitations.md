# 11 - Limitations

## 1. The purpose of this document

This document lists the known limits of the system. The team must read this document before the final submission. The report must state these limits honestly.

## 2. The data limits

### 2.1 The image datasets

The main image datasets are TACO and TrashNet. Both are still-image datasets. They help the waste detection. They do not help the event rules. The event rules need videos.

### 2.2 The test video scarcity

Public littering-action videos are rare. The proposal itself states this. The test set can be small. The validation metrics are valid only for the used videos. The report must state the test set size.

### 2.3 The class bias

The default model detects only the classes bottle and cup as waste. Other waste types need a custom model. A custom model trained on TACO covers more classes. The class distribution in TACO is not equal. Some classes have few images.

## 3. The detection limits

### 3.1 The small objects

The system can miss small or far objects. The detection threshold filters them out. The camera angle and the video quality change the results.

### 3.2 The occlusion

The system cannot see an object that is hidden behind another object. The object appears when it becomes visible. The event rules check the appearance time.

### 3.3 The camera motion

The system assumes a fixed camera. A moving camera changes all the positions. The stationary check can fail. The event rules can give false results with a moving camera.

## 4. The tracking limits

### 4.1 The track identity change

The tracker can give a new identity number to a person who leaves and re-enters the frame. The event engine keeps the old association. The event can be missed in this case.

### 4.2 The tracker warm-up

The tracker needs some frames to start. The first frames have no track ids. The event engine skips these detections.

## 5. The event rule limits

### 5.1 The rule is strict

The event fires only when all the rule conditions are true. A person who drops an object and stays near it gives no event. This is correct for the "leave it behind" definition, but it can miss real cases.

### 5.2 The rule is not a classifier

The rule is a set of conditions. It is not a trained action classifier. The system cannot recognize a littering action by itself. It only checks the positions and the movement.

### 5.3 The false alarms

The system can give false alarms. For example:

- A person walks near an object that becomes visible.
- An object moves because of the wind.
- The tracker mixes two objects.

The review status in the dashboard lets the operator mark these cases.

## 6. The technical limits

### 6.1 The processing speed

The processing speed depends on the hardware. The CPU gives a lower speed than a GPU. The FRAME_STEP value is a balance between speed and accuracy.

### 6.2 The clip codec

The OpenCV video writer may use the mp4v codec. Some browsers cannot play this codec. The operator uses the download link in this case.

### 6.3 The input types

The current version accepts uploaded video files only. The live webcam and the IP camera are planned. They are not implemented.

### 6.4 The access control

The system has no login and no access control. Anyone with the network access can open the dashboard. This is acceptable for a local demo. It is not safe for a public deployment.

## 7. The future work

The future work can remove some limits:

- Add the live webcam input.
- Add the live IP camera input.
- Train a custom model on TACO with more classes.
- Add a trained action classifier.
- Add the login and the access control.
- Deploy the system to a server.
- Add the automatic review with a second model.
