import math
import torch
from PIL import Image
import threading

class YOLOv5_Detector:
    def __init__(self, filename):
        # Model
        #model = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True)
        self.model = torch.hub.load('ultralytics/yolov5', 'custom', path_or_model=filename)
        if torch.cuda.is_available():
            self.model.cuda()
            t = torch.cuda.get_device_properties(0).total_memory
            r = torch.cuda.memory_reserved(0) 
            a = torch.cuda.memory_allocated(0)
            f = r-a  # free inside reserved
            print("free cuda mem:",f)
            self.batch_size = 16 # For our Tesla K8, this means 8 batches can run in parallel
        else:
            self.batch_size = torch.get_num_threads() # tuned to threads
        # add a semaphore so we don't run out of GPU memory between multiple clients
        self.semaphore = threading.Semaphore(8)

    def detect(self, img_files, events, id):
        # Inference in batches
        chunks = math.ceil(len(img_files)/self.batch_size)
        results = []
        print(" detecting ...")

        for i in range(0, len(img_files), self.batch_size):
            # make a batch of image urls
            img_batch = [Image.open(img_file) for img_file in img_files[i:i+self.batch_size]]

            # open the batch
            with self.semaphore: # limit the number of jobs going on in parallel, because of GPU mem
                result_obj = self.model(img_batch)

            #print(id(session), session['abort'])
            if events.query(id):
                print(" thread aborting.")
                return []

            results_raw = result_obj.xyxyn
            for result in results_raw:
                data = result.cpu().numpy().tolist()
                tile_results = [{'x1':item[0], 'y1':item[1], \
                            'x2':item[2], 'y2':item[3], \
                            'conf':item[4], 'class':int(item[5]), \
        	                    'class_name':result_obj.names[int(item[5])]} \
                            for item in data]
                results.append(tile_results)
            print(f" batch of {len(img_batch)} processed")

        print("")
        return results
