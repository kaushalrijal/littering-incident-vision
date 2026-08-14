# 04 - Datasets

## 1. The data decision

The team does not collect or curate any new dataset. This is a fixed decision for the project. The proposal text originally described self-recorded videos and manual annotation. The team changed this plan.

All the data comes from existing public sources. The system uses:

- The annotations that already exist in the public datasets.
- The pretrained model weights.
- The publicly available test videos.

The team does not create new labels. The team does not record new footage.

## 2. What the decision allows

The team can still do these tasks:

- Download the datasets.
- Download the model weights.
- Convert the annotation format with a script.
- Filter the classes.
- Split the data into train, validation, and test sets.
- Document the data sources.

These tasks are not data curation. They are data preparation.

## 3. The waste image datasets

### 3.1 TACO

TACO is the Trash Annotations in Context dataset.

| Item | Value |
| --- | --- |
| Content | Images of litter in real outdoor scenes |
| Count | About 1500 images |
| Classes | 60 waste classes |
| Format | COCO JSON annotations |
| Use | The main source for waste detection training |

The TACO repository is on GitHub. The repository has the annotation file and the download script. The operator downloads the images with the script.

### 3.2 TrashNet

TrashNet is a waste classification dataset.

| Item | Value |
| --- | --- |
| Content | Images of waste on a plain background |
| Count | 2527 images |
| Classes | glass, paper, cardboard, plastic, metal, trash |
| Format | One folder per class |
| Use | Extra images for the waste classes |

The TrashNet repository is on GitHub.

### 3.3 The pretrained COCO model

The default model yolov8n.pt is trained on the COCO dataset. The model detects persons, bottles, and cups without any extra training. This is the baseline of the system.

### 3.4 Open Images

Open Images v7 has many classes with existing boxes. The useful classes are person, bottle, and cup. The team can use this dataset for extra training images.

### 3.5 Roboflow Universe

Roboflow Universe has many public waste detection datasets. Many of them are already in the YOLO format. Many of them have train, validation, and test splits. Some of them copy TACO or TrashNet.

The operator searches for "litter" or "garbage" on the Roboflow Universe site.

### 3.6 Kaggle

Kaggle has many waste classification datasets. The team can use them as a supplement.

## 4. The class mapping

The pretrained COCO model has 80 classes. The default waste classes are bottle and cup. The operator can fine-tune a model on TACO. In that case, the operator sets the WASTE_CLASSES value to the class names of the custom model.

A suggested class set for a custom model:

| Class | Source |
| --- | --- |
| person | The COCO base model |
| bottle | TACO |
| cup | TACO |
| wrapper | TACO |
| paper | TACO |
| other_waste | TACO |

The report should include the mapping table. The reviewers expect this.

## 5. The test videos

The event engine needs videos of the littering action. Public littering-action datasets are rare. The proposal itself says this.

The team sources test videos from public places:

- YouTube compilations of CCTV footage (where permitted).
- Pexels and Pixabay stock clips.
- Public demo videos of similar systems.

The team needs a mix of videos:

| Type | Expected result |
| --- | --- |
| A person drops an object and walks away | One incident |
| A person walks past existing litter | No incident |
| A person carries an object but keeps it | No incident |
| Many people, no one drops an object | No incident |

The team marks the expected result for each video. This marking is evaluation labeling. It is not data curation. The team does not create new footage.

### 5.1 The licensing

The team must follow the license of each video. The team must:

- Prefer Creative Commons or stock footage.
- Cite every video in the report appendix.
- Never claim the footage as the team's own work.

## 6. The provenance sheet

The team keeps a provenance sheet. The sheet lists each data source with:

- The name.
- The version.
- The license.
- The URL.
- The access date.

The report appendix includes this sheet.

## 7. The fine-tuning flow

This is the flow to fine-tune a model on TACO:

1. Download the TACO repository.
2. Install the TACO requirements.
3. Run the TACO download script to get the images.
4. Convert the COCO annotations to the YOLO format.
5. Train the model with the YOLO command.
6. Copy the best weights to the ml/models folder.
7. Set MODEL_PATH and WASTE_CLASSES in the .env file.

The training is fast. TACO has about 1500 images. A free Colab GPU is enough.

## 8. The report statement

The report must state the data decision clearly. A suggested statement:

"Zero new data was collected and zero annotations were created by the team. All data and labels come from public sources. The team used only format conversion, class filtering, and splitting scripts."
