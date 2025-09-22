# Télécharger le fichier TDMS :
```
curl.exe -L -o Digital_Input.tdms "https://raw.githubusercontent.com/adamreeve/npTDMS/master/nptdms/test/data/Digital_Input.tdms"
```

## Créer un dossier tdms-backend

```
cd tdms-backend
winget search Python 3.11
winget install --id Python.Python.3.11 -s winget
py -3.11 --version
```

> Cela doit retourner la version 3.11.9

```
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

> Pour Linux utiliser la commande `source venv/bin/activate` à la place de `.\.venv\Scripts\Activate.ps1`

## On créer les fichiers python pour FastAPI

## Lancer le serveur FastAPI (à lancer dans le venv actif) | et donc `cd tdms-backend`
```
.\.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

## Ouvrir la doc via ce endpoint :
> http://localhost:8000/docs

## Tester l’ingestion, dans un nouveau terminal powershell ou linux
> Se rendre dans le path : `C:\Users\Utilisateur\Desktop\Python\tdms-test>`
```
curl.exe -F "file=@Digital_Input.tdms" http://localhost:8000/ingest
```

## Une fois le fichier ingérer, tester les routes GET suivantes :

> http://localhost:8000/datasets
> http://localhost:8000/datasets/2/channels
> http://localhost:8000/window?channel_id=2&points=400


## Lancer le frontend | et donc `cd tdms-fronted`

```
npm run dev
```


---

> https://fr.mathworks.com/help/daq/examples.html?s_tid=CRUX_topnav&category=tdms-format-files

# Courbe multi-traces façon MATLAB
> Ajout du fichier tdms-backend\make_week_signals.py

## Création du fichier dataset (TDMS) :

```
cd tdms-backend
.\.venv\Scripts\Activate.ps1
python .\make_week_signals.py
```

> SORTIE : tdms-backend\week_signals.tdms

## (Si ce n'est pas déjà fait,) Lancer le serveur FastAPI 
```
.\.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

## Ingérer le fichier tdms-backend\week_signals.tdms
> Ouvrir un autre terminal et se rendre dans `cd tdms-backend` (car c'est là où se situe notre fichier)
```
curl.exe -F "file=@week_signals.tdms" http://localhost:8000/ingest
```


# Amplitude sweep / Phase sweep
> cf. `tdms-backend\make_sweep_tdms.py`

## Générer le fichier tdms :
```
cd tdms-backend
.\.venv\Scripts\Activate.ps1
python .\make_sweep_tdms.py
```

> Une fois le fichier `tdms-backend/sweeps.tdms` généré

## Lancer le serveur si ce n'est pas déjà fait (`uvicorn app.main:app --reload --port 8000`)
> Puis ingérer le nouveau fichier

```
curl.exe -F "file=@sweeps.tdms" http://localhost:8000/ingest
```


# Graphiqe : Pulse / Sensor X / Sensor Y
> Etape 1 on créer le fichier suivant `tdms-backend\make_pulse_tdms.py`

> Puis comme d'habitude :
```
cd tdms-backend
.\.venv\Scripts\Activate.ps1
python .\make_pulse_tdms.py
```


## Une fois le fichier `tdms-backend\pulse_ringing.tdms` généré 
## Ingérer le fichier(# Attention le serveur backend doit être démarré : `uvicorn app.main:app --reload --port 8000) :
```
curl.exe -F "file=@pulse_ringing.tdms" http://localhost:8000/ingest 
```

# Graph météo multi-canaux
> Création du fichier python servant à générer le tdms d'exemple : `tdms-backend\make_weather_tdms.py`

## Lancer la génération de fichier tdms : 
```
cd tdms-backend
.\.venv\Scripts\Activate.ps1
python .\make_weather_tdms.py
```

## Ingestion du fichier 
```
curl.exe -F "file=@weather_60d.tdms" http://localhost:8000/ingest
```

# Timetable Motor Graph
> Créer le fichier python suivant `tdms-backend\make_timetable_motor.py`

## Création du fichier tdms associé
```
cd tdms-backend
.\.venv\Scripts\Activate.ps1
python .\make_timetable_motor.py
```

## Ingestion du fichier 
```
curl.exe -F "file=@motor_timetable.tdms" http://localhost:8000/ingest
```

# Meta Motor
> Créer le fichier python suivant `tdms-backend\make_meta_motor.py`

## Création du fichier tdms associé
```
cd tdms-backend
.\.venv\Scripts\Activate.ps1
python .\make_meta_motor.py
```

## Ingestion du fichier 
```
curl.exe -F "file=@motor_meta.tdms" http://localhost:8000/ingest
```

# Installation de  ClickHouse
```
docker compose up -d
```

> Se rendre ensuite sur : http://localhost:8123/play
> En haut à gauche entrer les identifiants : tdms_user / password

## Pour vérifier que tout est paramétré correctement
```
SHOW DATABASES; 
```

