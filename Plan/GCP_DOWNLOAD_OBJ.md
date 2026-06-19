This page shows you how to download objects from your buckets in
Cloud Storage to persistent storage. You can also
[download objects into memory](https://docs.cloud.google.com/storage/docs/downloading-objects-into-memory).

> [!NOTE]
> **Note:** If you use [customer-supplied encryption keys](https://docs.cloud.google.com/storage/docs/encryption/customer-supplied-keys) with your objects, see [Download objects you've encrypted](https://docs.cloud.google.com/storage/docs/encryption/using-customer-supplied-keys#download-decrypt) for downloading instructions.

## Required roles

In order to get the required permissions for downloading objects, ask your
administrator to grant you the Storage Object Viewer
(`roles/storage.objectViewer`) role on the bucket. If you plan on using the
Google Cloud console, ask your administrator to grant you the Storage Admin
(`roles/storage.admin`) role on the bucket instead.

These roles contain the permissions required to download objects. To see the
exact permissions that are required, expand the **Required permissions**
section:

#### Required permissions

- `storage.buckets.list`
  - This permission is only required for using the Google Cloud console to perform the tasks on this page.
- `storage.objects.get`
- `storage.objects.list`
  - This permission is only required for using the Google Cloud console to perform the tasks on this page.

You might also be able to get these permissions with other
[predefined roles](https://docs.cloud.google.com/iam/docs/understanding-roles) or [custom roles](https://docs.cloud.google.com/iam/docs/creating-custom-roles).

For instructions on granting roles on buckets, see
[Set and manage IAM policies on buckets](https://docs.cloud.google.com/storage/docs/access-control/using-iam-permissions).

## Download an object from a bucket

Complete the following instructions to download an object from a bucket:

### Console

1. In the Google Cloud console, go to the Cloud Storage **Buckets** page.

   [Go to Buckets](https://console.cloud.google.com/storage/browser)

2. In the list of buckets, click the name of the bucket that contains
   the object you want to download.

   The **Bucket details** page opens, with the **Objects** tab selected.

3. Navigate to the object, which may be located in a folder.

4. Click the **Download** icon associated with the object.

   Your browser settings control the download location for the object.

> [!NOTE]
> **Note:** For some object types, selecting **Download** opens the object in the browser. To download these objects to your local computer, right-click **Download** and select **Save Link As...**.

To learn how to get detailed error information about failed Cloud Storage
operations in the Google Cloud console, see
[Troubleshooting](https://docs.cloud.google.com/storage/docs/troubleshooting#trouble-console).

### Command line

Use the [`gcloud storage cp` command](https://docs.cloud.google.com/sdk/gcloud/reference/storage/cp):

```
gcloud storage cp gs://BUCKET_NAME/OBJECT_NAME SAVE_TO_LOCATION
```

Where:

- `BUCKET_NAME` is the name of the bucket
  containing the object you are downloading. For example, `my-bucket`.

- `OBJECT_NAME` is the name of object you are
  downloading. For example, `pets/dog.png`.

- `SAVE_TO_LOCATION` is the local path where you
  are saving your object. For example, `Desktop/Images`.

If successful, the response looks like the following example:

```
Completed files 1/1 | 164.3kiB/164.3kiB
```

If your download is interrupted prior to completion, run the same `cp`
command to resume the download from where it left off.

### Client libraries

### C++

For more information, see the
[Cloud Storage C++ API
reference documentation](https://docs.cloud.google.com/cpp/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    namespace gcs = ::google::cloud::storage;
    [](gcs::Client client, std::string const& bucket_name,
       std::string const& object_name) {
      gcs::ObjectReadStream stream = client.ReadObject(bucket_name, object_name);

      int count = 0;
      std::string line;
      while (std::getline(stream, line, '\n')) {
        ++count;
      }
      if (stream.bad()) throw google::cloud::Status(stream.status());

      std::cout << "The object has " << count << " lines\n";
    }

### C#

For more information, see the
[Cloud Storage C# API
reference documentation](https://cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    using https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.html;
    using System;
    using System.IO;

    public class DownloadFileSample
    {
        public void DownloadFile(
            string bucketName = "your-unique-bucket-name",
            string objectName = "my-file-name",
            string localPath = "my-local-path/my-file-name")
        {
            var storage = https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html#Google_Cloud_Storage_V1_StorageClient_Create();
            using var outputFile = File.OpenWrite(localPath);
            storage.DownloadObject(bucketName, objectName, outputFile);
            Console.WriteLine($"Downloaded {objectName} to {localPath}.");
        }
    }

### Go

For more information, see the
[Cloud Storage Go API
reference documentation](https://pkg.go.dev/cloud.google.com/go/storage).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    import (
    	"context"
    	"fmt"
    	"io"
    	"os"
    	"time"

    	"cloud.google.com/go/storage"
    )

    // downloadFile downloads an object to a file.
    func downloadFile(w io.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Writer, bucket, object string, destFileName string) error {
    	// bucket := "bucket-name"
    	// object := "object-name"
    	// destFileName := "file.txt"
    	ctx := context.Background()
    	client, err := storage.NewClient(ctx)
    	if err != nil {
    		return fmt.Errorf("storage.NewClient: %w", err)
    	}
    	defer client.Close()

    	ctx, cancel := context.WithTimeout(ctx, time.Second*50)
    	defer cancel()

    	f, err := os.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_BucketHandle_Create(destFileName)
    	if err != nil {
    		return fmt.Errorf("os.Create: %w", err)
    	}

    	rc, err := client.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Client_Bucket(bucket).https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_BucketHandle_Object(object).https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_ObjectHandle_NewReader(ctx)
    	if err != nil {
    		return fmt.Errorf("Object(%q).NewReader: %w", object, err)
    	}
    	defer rc.Close()

    	if _, err := io.Copy(f, rc); err != nil {
    		return fmt.Errorf("io.Copy: %w", err)
    	}

    	if err = f.Close(); err != nil {
    		return fmt.Errorf("f.Close: %w", err)
    	}

    	fmt.Fprintf(w, "Blob %v downloaded to local file %v\n", object, destFileName)

    	return nil

    }

### Java

For more information, see the
[Cloud Storage Java API
reference documentation](https://cloud.google.com/java/docs/reference/google-cloud-storage/latest/overview).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample downloads an individual object:

    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html;
    import java.nio.file.Paths;

    public class DownloadObject {
      public static void downloadObject(
          String projectId, String bucketName, String objectName, String destFilePath)
          throws Exception {
        // The ID of your GCP project
        // String projectId = "your-project-id";

        // The ID of your GCS bucket
        // String bucketName = "your-unique-bucket-name";

        // The ID of your GCS object
        // String objectName = "your-object-name";

        // The path to which the file should be downloaded
        // String destFilePath = "/local/path/to/file.txt";

        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html storageOptions = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html.newBuilder().setProjectId(projectId).build();
        try (https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html storage = storageOptions.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html#com_google_cloud_storage_transfermanager_TransferManagerConfig_getService__()) {

          storage.downloadTo(https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html.of(bucketName, objectName), Paths.get(destFilePath));

          System.out.println(
              "Downloaded object "
                  + objectName
                  + " from bucket name "
                  + bucketName
                  + " to "
                  + destFilePath);
        }
      }
    }

The following sample downloads multiple objects using multiple processes:

    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html;
    import com.google.cloud.storage.transfermanager.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.DownloadResult.html;
    import com.google.cloud.storage.transfermanager.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.ParallelDownloadConfig.html;
    import com.google.cloud.storage.transfermanager.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManager.html;
    import com.google.cloud.storage.transfermanager.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html;
    import java.nio.file.Path;
    import java.util.List;

    class DownloadMany {

      public static void downloadManyBlobs(
          String bucketName, List<BlobInfo> blobs, Path destinationDirectory) throws Exception {

        try (https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManager.html transferManager =
            https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html.newBuilder().build().getService()) {
          https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.ParallelDownloadConfig.html parallelDownloadConfig =
              https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.ParallelDownloadConfig.html.newBuilder()
                  .setBucketName(bucketName)
                  .setDownloadDirectory(destinationDirectory)
                  .build();

          List<DownloadResult> results =
              transferManager.downloadBlobs(blobs, parallelDownloadConfig).getDownloadResults();

          for (https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.DownloadResult.html result : results) {
            System.out.println(
                "Download of "
                    + https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.spi.v1.StorageRpc.RewriteResponse.html#com_google_cloud_storage_spi_v1_StorageRpc_RewriteResponse_result.getInput().getName()
                    + " completed with status "
                    + https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.spi.v1.StorageRpc.RewriteResponse.html#com_google_cloud_storage_spi_v1_StorageRpc_RewriteResponse_result.getStatus());
          }
        }
      }
    }

The following sample downloads all objects with a common prefix using multiple processes:

    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html;
    import com.google.cloud.storage.transfermanager.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.DownloadResult.html;
    import com.google.cloud.storage.transfermanager.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.ParallelDownloadConfig.html;
    import com.google.cloud.storage.transfermanager.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManager.html;
    import com.google.cloud.storage.transfermanager.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html;
    import java.nio.file.Path;
    import java.util.List;
    import java.util.stream.Collectors;

    class DownloadBucket {

      public static void downloadBucketContents(
          String projectId, String bucketName, Path destinationDirectory) {
        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html storage = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html.newBuilder().setProjectId(projectId).build().getService();
        List<BlobInfo> blobs =
            storage
                .list(bucketName)
                .streamAll()
                .map(blob -> blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html#com_google_cloud_storage_Blob_asBlobInfo__())
                .collect(Collectors.toList());
        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManager.html transferManager = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html.newBuilder().build().getService();
        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.ParallelDownloadConfig.html parallelDownloadConfig =
            https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.ParallelDownloadConfig.html.newBuilder()
                .setBucketName(bucketName)
                .setDownloadDirectory(destinationDirectory)
                .build();

        List<DownloadResult> results =
            transferManager.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManager.html#com_google_cloud_storage_transfermanager_TransferManager_downloadBlobs_java_util_List_com_google_cloud_storage_BlobInfo__com_google_cloud_storage_transfermanager_ParallelDownloadConfig_(blobs, parallelDownloadConfig).getDownloadResults();

        for (https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.DownloadResult.html result : results) {
          System.out.println(
              "Download of "
                  + https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.spi.v1.StorageRpc.RewriteResponse.html#com_google_cloud_storage_spi_v1_StorageRpc_RewriteResponse_result.getInput().getName()
                  + " completed with status "
                  + https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.spi.v1.StorageRpc.RewriteResponse.html#com_google_cloud_storage_spi_v1_StorageRpc_RewriteResponse_result.getStatus());
        }
      }
    }

### Node.js

For more information, see the
[Cloud Storage Node.js API
reference documentation](https://cloud.google.com/nodejs/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample downloads an individual object:

    /**
     * TODO(developer): Uncomment the following lines before running the sample.
     */
    // The ID of your GCS bucket
    // const bucketName = 'your-unique-bucket-name';

    // The ID of your GCS file
    // const fileName = 'your-file-name';

    // The path to which the file should be downloaded
    // const destFileName = '/local/path/to/file.txt';

    // Imports the Google Cloud client library
    const {Storage} = require('https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/overview.html');

    // Creates a client
    const storage = new https://docs.cloud.google.com/nodejs/docs/reference/storage-control/latest/storage-control/protos.google.storage.v2.storage-class.html();

    async function downloadFile() {
      const options = {
        destination: destFileName,
      };

      // Downloads the file
      await storage.bucket(bucketName).file(fileName).https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/file_2.html(options);

      console.log(
        `gs://${bucketName}/${fileName} downloaded to ${destFileName}.`
      );
    }

    downloadFile().catch(console.error);

The following sample downloads multiple objects using multiple processes:

    /**
     * TODO(developer): Uncomment the following lines before running the sample.
     */
    // The ID of your GCS bucket
    // const bucketName = 'your-unique-bucket-name';

    // The ID of the first GCS file to download
    // const firstFileName = 'your-first-file-name';

    // The ID of the second GCS file to download
    // const secondFileName = 'your-second-file-name;

    // Imports the Google Cloud client library
    const {Storage, TransferManager} = require('https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/overview.html');

    // Creates a client
    const storage = new https://docs.cloud.google.com/nodejs/docs/reference/storage-control/latest/storage-control/protos.google.storage.v2.storage-class.html();

    // Creates a transfer manager client
    const transferManager = new https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/transfermanager.html(storage.bucket(bucketName));

    async function downloadManyFilesWithTransferManager() {
      // Downloads the files
      await transferManager.https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/transfermanager.html([firstFileName, secondFileName]);

      for (const fileName of [firstFileName, secondFileName]) {
        console.log(`gs://${bucketName}/${fileName} downloaded to ${fileName}.`);
      }
    }

    downloadManyFilesWithTransferManager().catch(console.error);

The following sample downloads all objects with a common prefix using multiple processes:

    /**
     * TODO(developer): Uncomment the following lines before running the sample.
     */
    // The ID of your GCS bucket
    // const bucketName = 'your-unique-bucket-name';

    // The ID of the GCS folder to download. The folder will be downloaded to the local path of the executing code.
    // const folderName = 'your-folder-name';

    // Imports the Google Cloud client library
    const {Storage, TransferManager} = require('https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/overview.html');

    // Creates a client
    const storage = new https://docs.cloud.google.com/nodejs/docs/reference/storage-control/latest/storage-control/protos.google.storage.v2.storage-class.html();

    // Creates a transfer manager client
    const transferManager = new https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/transfermanager.html(storage.bucket(bucketName));

    async function downloadFolderWithTransferManager() {
      // Downloads the folder
      await transferManager.https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/transfermanager.html(folderName);

      console.log(
        `gs://${bucketName}/${folderName} downloaded to ${folderName}.`
      );
    }

    downloadFolderWithTransferManager().catch(console.error);

### PHP

For more information, see the
[Cloud Storage PHP API
reference documentation](https://googleapis.github.io/google-cloud-php/#/docs/google-cloud/latest/storage/storageclient).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    use Google\Cloud\Storage\StorageClient;

    /**
     * Download an object from Cloud Storage and save it as a local file.
     *
     * @param string $bucketName The name of your Cloud Storage bucket.
     *        (e.g. 'my-bucket')
     * @param string $objectName The name of your Cloud Storage object.
     *        (e.g. 'my-object')
     * @param string $destination The local destination to save the object.
     *        (e.g. '/path/to/your/file')
     */
    function download_object(string $bucketName, string $objectName, string $destination): void
    {
        $storage = new StorageClient();
        $bucket = $storage->bucket($bucketName);
        $object = $bucket->object($objectName);
        $object->downloadToFile($destination);
        printf(
            'Downloaded gs://%s/%s to %s' . PHP_EOL,
            $bucketName,
            $objectName,
            basename($destination)
        );
    }

### Python

For more information, see the
[Cloud Storage Python API
reference documentation](https://cloud.google.com/python/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample downloads an individual object:

    from google.cloud import https://docs.cloud.google.com/python/docs/reference/storage/latest


    def download_blob(bucket_name, source_blob_name, destination_file_name):
        """Downloads a blob from the bucket."""
        # The ID of your GCS bucket
        # bucket_name = "your-bucket-name"

        # The ID of your GCS object
        # source_blob_name = "storage-object-name"

        # The path to which the file should be downloaded
        # destination_file_name = "local/path/to/file"

        storage_client = https://docs.cloud.google.com/python/docs/reference/storage/latest.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html()

        bucket = storage_client.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html#google_cloud_storage_client_Client_bucket(bucket_name)

        # Construct a client side representation of a blob.
        # Note `Bucket.blob` differs from `Bucket.get_blob` as it doesn't retrieve
        # any content from Google Cloud Storage. As we don't need additional data,
        # using `Bucket.blob` is preferred here.
        blob = bucket.blob(source_blob_name)
        blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_download_to_filename(destination_file_name)

        print(
            "Downloaded storage object {} from bucket {} to local file {}.".format(
                source_blob_name, bucket_name, destination_file_name
            )
        )

The following sample downloads multiple objects using multiple processes:

    def download_many_blobs_with_transfer_manager(
        bucket_name, blob_names, destination_directory="", blob_name_prefix="", workers=8
    ):
        """Download blobs in a list by name, concurrently in a process pool.

        The filename of each blob once downloaded is derived from the blob name and
        the `destination_directory `parameter. For complete control of the filename
        of each blob, use transfer_manager.download_many() instead.

        Directories will be created automatically as needed to accommodate blob
        names that include slashes.
        """

        # The ID of your GCS bucket
        # bucket_name = "your-bucket-name"

        # The list of blob names to download. The names of each blobs will also
        # be the name of each destination file (use transfer_manager.download_many()
        # instead to control each destination file name). If there is a "/" in the
        # blob name, then corresponding directories will be created on download.
        # blob_names = ["myblob", "myblob2"]

        # The directory on your computer to which to download all of the files. This
        # string is prepended to the name of each blob to form the full path using
        # pathlib. Relative paths and absolute paths are both accepted. An empty
        # string means "the current working directory". Note that this parameter
        # will NOT allow files to escape the destination_directory and will skip
        # downloads that attempt directory traversal outside of it.
        # destination_directory = ""

        # The maximum number of processes to use for the operation. The performance
        # impact of this value depends on the use case, but smaller files usually
        # benefit from a higher number of processes. Each additional process occupies
        # some CPU and memory resources until finished. Threads can be used instead
        # of processes by passing `worker_type=transfer_manager.THREAD`.
        # workers=8

        from google.cloud.storage import https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html, https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.transfer_manager.html

        storage_client = Client()
        bucket = storage_client.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html#google_cloud_storage_client_Client_bucket(bucket_name)

        results = https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.transfer_manager.html.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.transfer_manager.html(
            bucket,
            blob_names,
            destination_directory=destination_directory,
            blob_name_prefix=blob_name_prefix,
            max_workers=workers,
        )

        for name, result in zip(blob_names, results):
            # The results list is either `None`, an exception, or a warning for each blob in
            # the input list, in order.
            if isinstance(result, UserWarning):
                print("Skipped download for {} due to warning: {}".format(name, result))
            elif isinstance(result, Exception):
                print("Failed to download {} due to exception: {}".format(name, result))
            else:
                print(
                    "Downloaded {} inside {} directory.".format(name, destination_directory)
                )

The following sample downloads all objects in a bucket using multiple processes:

    def download_bucket_with_transfer_manager(
        bucket_name, destination_directory="", workers=8, max_results=1000
    ):
        """Download all of the blobs in a bucket, concurrently in a process pool.

        The filename of each blob once downloaded is derived from the blob name and
        the `destination_directory `parameter. For complete control of the filename
        of each blob, use transfer_manager.download_many() instead.

        Directories will be created automatically as needed, for instance to
        accommodate blob names that include slashes.
        """

        # The ID of your GCS bucket
        # bucket_name = "your-bucket-name"

        # The directory on your computer to which to download all of the files. This
        # string is prepended (with os.path.join()) to the name of each blob to form
        # the full path. Relative paths and absolute paths are both accepted. An
        # empty string means "the current working directory". Note that this
        # parameter allows accepts directory traversal ("../" etc.) and is not
        # intended for unsanitized end user input.
        # destination_directory = ""

        # The maximum number of processes to use for the operation. The performance
        # impact of this value depends on the use case, but smaller files usually
        # benefit from a higher number of processes. Each additional process occupies
        # some CPU and memory resources until finished. Threads can be used instead
        # of processes by passing `worker_type=transfer_manager.THREAD`.
        # workers=8

        # The maximum number of results to fetch from bucket.list_blobs(). This
        # sample code fetches all of the blobs up to max_results and queues them all
        # for download at once. Though they will still be executed in batches up to
        # the processes limit, queueing them all at once can be taxing on system
        # memory if buckets are very large. Adjust max_results as needed for your
        # system environment, or set it to None if you are sure the bucket is not
        # too large to hold in memory easily.
        # max_results=1000

        from google.cloud.storage import https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html, https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.transfer_manager.html

        storage_client = Client()
        bucket = storage_client.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html#google_cloud_storage_client_Client_bucket(bucket_name)

        blob_names = [blob.name for blob in bucket.list_blobs(max_results=max_results)]

        results = https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.transfer_manager.html.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.transfer_manager.html(
            bucket, blob_names, destination_directory=destination_directory, max_workers=workers
        )

        for name, result in zip(blob_names, results):
            # The results list is either `None` or an exception for each blob in
            # the input list, in order.

            if isinstance(result, Exception):
                print("Failed to download {} due to exception: {}".format(name, result))
            else:
                print("Downloaded {} to {}.".format(name, destination_directory + name))

### Ruby

For more information, see the
[Cloud Storage Ruby API
reference documentation](https://googleapis.dev/ruby/google-cloud-storage/latest/Google/Cloud/Storage.html).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    def download_file bucket_name:, file_name:, local_file_path:
      # The ID of your GCS bucket
      # bucket_name = "your-unique-bucket-name"

      # The ID of your GCS object
      # file_name = "your-file-name"

      # The path to which the file should be downloaded
      # local_file_path = "/local/path/to/file.txt"

      require "google/cloud/storage"

      storage = Google::Cloud::https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage-control-v2/latest/Google-Cloud-Storage.html.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage.html
      bucket  = storage.bucket bucket_name, skip_lookup: true
      file    = bucket.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-Bucket.html file_name

      file.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-File.html local_file_path

      puts "Downloaded #{file.name} to #{local_file_path}"
    end

### Rust

    use google_cloud_storage::client::Storage;
    use tokio::io::AsyncWriteExt;

    pub async fn sample(
        client: &Storage,
        bucket: &str,
        object: &str,
        file_path: &str,
    ) -> Result<(), anyhow::Error> {
        let mut reader = client
            .read_object(format!("projects/_/buckets/{bucket}"), object)
            .send()
            .await?;

        let mut file = tokio::fs::File::create(file_path).await?;
        while let Some(data) = reader.next().await.transpose()? {
            file.write_all(&data).await?;
        }
        file.flush().await?;

        println!("Downloaded {object} in bucket {bucket} to {file_path}.");
        Ok(())
    }

<br />

### REST APIs

### JSON API

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](https://curl.haxx.se/) to call the [JSON API](https://docs.cloud.google.com/storage/docs/json_api) with a
   [`GET` Object](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/get) request:

   ```
   curl -X GET \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -o "SAVE_TO_LOCATION" \
     "https://storage.googleapis.com/storage/v1/b/BUCKET_NAME/o/OBJECT_NAME?alt=media"
   ```

   Where:
   - `SAVE_TO_LOCATION` is the path to the location where you want to save your object. For example, `Desktop/dog.png`.
   - `BUCKET_NAME` is the name of the bucket containing the object you are downloading. For example, `my-bucket`.
   - `OBJECT_NAME` is the URL-encoded name of the object you are downloading. For example, `pets/dog.png`, URL-encoded as `pets%2Fdog.png`.

### XML API

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](https://curl.haxx.se/) to call the [XML API](https://docs.cloud.google.com/storage/docs/xml-api/overview) with a
   [`GET` Object](https://docs.cloud.google.com/storage/docs/xml-api/get-object-download) request:

   ```
   curl -X GET \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -o "SAVE_TO_LOCATION" \
     "https://storage.googleapis.com/BUCKET_NAME/OBJECT_NAME"
   ```

   Where:
   - `SAVE_TO_LOCATION` is the path to the location where you want to save your object. For example, `Desktop/dog.png`.
   - `BUCKET_NAME` is the name of the bucket containing the object you are downloading. For example, `my-bucket`.
   - `OBJECT_NAME` is the URL-encoded name of the object you are downloading. For example, `pets/dog.png`, URL-encoded as `pets%2Fdog.png`.

To more efficiently download all objects in a bucket or subdirectory, use the
[`gcloud storage cp`](https://docs.cloud.google.com/sdk/gcloud/reference/storage/cp) command or a client library:

```
gcloud storage cp --recursive gs://BUCKET_NAME/FOLDER_NAME .
```

## Download a portion of an object

> [!NOTE]
> **Note:** Object [checksums](https://docs.cloud.google.com/storage/docs/metadata#checksums) apply to an object in its entirety. This means checksums can't be used to [validate the integrity](https://docs.cloud.google.com/storage/docs/data-validation#client-validation-reads) of a portion of an object.

If your download gets interrupted, you can resume where you left off by
requesting only the portion of the object that's left. Complete the following
instructions to download a portion of an object.

### Console

The Google Cloud console does not support downloading portions of an
object. Use the gcloud CLI instead.

### Command line

The Google Cloud CLI automatically attempts to resume interrupted downloads,
except when performing [streaming downloads](https://docs.cloud.google.com/storage/docs/streaming-downloads). If your download gets
interrupted, a partially downloaded temporary file becomes visible in
the destination hierarchy. Run the same [`cp`](https://docs.cloud.google.com/sdk/gcloud/reference/storage/cp) command to resume the
download where it left off.

When the download is complete, the temporary file is deleted and
replaced with the downloaded contents. Temporary files are stored in a
configurable location, which by default is in the user's home directory
under `.config/gcloud/surface_data/storage/tracker_files`. You can
change or view the location that temporary files are stored by running
[`gcloud config get storage/tracker_files_directory`](https://docs.cloud.google.com/sdk/gcloud/reference/config/get).

### Client libraries

### C++

For more information, see the
[Cloud Storage C++ API
reference documentation](https://docs.cloud.google.com/cpp/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    namespace gcs = ::google::cloud::storage;
    [](gcs::Client client, std::string const& bucket_name,
       std::string const& object_name, std::int64_t start, std::int64_t end) {
      gcs::ObjectReadStream stream =
          client.ReadObject(bucket_name, object_name, gcs::ReadRange(start, end));

      int count = 0;
      std::string line;
      while (std::getline(stream, line, '\n')) {
        std::cout << line << "\n";
        ++count;
      }
      if (stream.bad()) throw google::cloud::Status(stream.status());

      std::cout << "The requested range has " << count << " lines\n";
    }

### C#

For more information, see the
[Cloud Storage C# API
reference documentation](https://cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    using Google.Apis.Storage.v1;
    using https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.html;
    using System;
    using System.IO;
    using System.Net.Http;
    using System.Net.Http.Headers;
    using System.Threading.Tasks;

    public class DownloadByteRangeAsyncSample
    {
        public async Task DownloadByteRangeAsync(
            string bucketName = "your-unique-bucket-name",
            string objectName = "my-file-name",
            long firstByte = 0,
            long lastByte = 20,
            string localPath = "my-local-path/my-file-name")
        {
            var storageClient = https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html#Google_Cloud_Storage_V1_StorageClient_Create();

            // Create an HTTP request for the media, for a limited byte range.
            StorageService storage = storageClient.Service;
            var uri = new Uri($"{storage.BaseUri}b/{bucketName}/o/{objectName}?alt=media");

            var request = new HttpRequestMessage { RequestUri = uri };
            request.Headers.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.DownloadObjectOptions.html#Google_Cloud_Storage_V1_DownloadObjectOptions_Range = new RangeHeaderValue(firstByte, lastByte);

            using var outputFile = File.OpenWrite(localPath);
            // Use the HttpClient in the storage object because it supplies
            // all the authentication headers we need.
            var response = await storage.HttpClient.SendAsync(request);
            await response.Content.CopyToAsync(outputFile, null);
            Console.WriteLine($"Downloaded {objectName} to {localPath}.");
        }
    }

### Go

For more information, see the
[Cloud Storage Go API
reference documentation](https://pkg.go.dev/cloud.google.com/go/storage).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    import (
    	"context"
    	"fmt"
    	"io"
    	"os"
    	"time"

    	"cloud.google.com/go/storage"
    )

    // downloadByteRange downloads a specific byte range of an object to a file.
    func downloadByteRange(w io.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Writer, bucket, object string, startByte int64, endByte int64, destFileName string) error {
    	// bucket := "bucket-name"
    	// object := "object-name"
    	// startByte := 0
    	// endByte := 20
    	// destFileName := "file.txt"
    	ctx := context.Background()
    	client, err := storage.NewClient(ctx)
    	if err != nil {
    		return fmt.Errorf("storage.NewClient: %w", err)
    	}
    	defer client.Close()

    	ctx, cancel := context.WithTimeout(ctx, time.Second*50)
    	defer cancel()

    	f, err := os.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_BucketHandle_Create(destFileName)
    	if err != nil {
    		return fmt.Errorf("os.Create: %w", err)
    	}

    	length := endByte - startByte
    	rc, err := client.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Client_Bucket(bucket).https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_BucketHandle_Object(object).https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_ObjectHandle_NewRangeReader(ctx, startByte, length)
    	if err != nil {
    		return fmt.Errorf("Object(%q).NewReader: %w", object, err)
    	}
    	defer rc.Close()

    	if _, err := io.Copy(f, rc); err != nil {
    		return fmt.Errorf("io.Copy: %w", err)
    	}

    	if err = f.Close(); err != nil {
    		return fmt.Errorf("f.Close: %w", err)
    	}

    	fmt.Fprintf(w, "Bytes %v to %v of blob %v downloaded to local file %v\n", startByte, startByte+length, object, destFileName)

    	return nil

    }

### Java

For more information, see the
[Cloud Storage Java API
reference documentation](https://cloud.google.com/java/docs/reference/google-cloud-storage/latest/overview).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    import com.google.cloud.https://docs.cloud.google.com/java/docs/reference/google-cloud-core/latest/com.google.cloud.ReadChannel.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html;
    import com.google.common.io.ByteStreams;
    import java.io.IOException;
    import java.nio.channels.FileChannel;
    import java.nio.file.Paths;
    import java.nio.file.StandardOpenOption;

    public class DownloadByteRange {

      public static void downloadByteRange(
          https://docs.cloud.google.com/java/docs/reference/google-cloud-bigtable/latest/com.google.cloud.bigtable.common.Type.String.html projectId,
          https://docs.cloud.google.com/java/docs/reference/google-cloud-bigtable/latest/com.google.cloud.bigtable.common.Type.String.html bucketName,
          https://docs.cloud.google.com/java/docs/reference/google-cloud-bigtable/latest/com.google.cloud.bigtable.common.Type.String.html blobName,
          long startByte,
          long endBytes,
          https://docs.cloud.google.com/java/docs/reference/google-cloud-bigtable/latest/com.google.cloud.bigtable.common.Type.String.html destFileName)
          throws IOException {
        // The ID of your GCP project
        // String projectId = "your-project-id";

        // The ID of your GCS bucket
        // String bucketName = "your-unique-bucket-name";

        // The name of the blob/file that you wish to modify permissions on
        // String blobName = "your-blob-name";

        // The starting byte at which to begin the download
        // long startByte = 0;

        // The ending byte at which to end the download
        // long endByte = 20;

        // The path to which the file should be downloaded
        // String destFileName = '/local/path/to/file.txt';

        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html storage = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html.newBuilder().setProjectId(projectId).build().getService();
        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html blobId = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html.of(bucketName, blobName);
        try (https://docs.cloud.google.com/java/docs/reference/google-cloud-core/latest/com.google.cloud.ReadChannel.html from = storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html#com_google_cloud_storage_Storage_reader_com_google_cloud_storage_BlobId_com_google_cloud_storage_Storage_BlobSourceOption____(blobId);
            FileChannel to = FileChannel.open(Paths.get(destFileName), StandardOpenOption.WRITE)) {
          from.seek(startByte);
          from.limit(endBytes);

          ByteStreams.copy(from, to);

          System.out.printf(
              "%s downloaded to %s from byte %d to byte %d%n",
              blobId.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html#com_google_cloud_storage_BlobId_toGsUtilUri__(), destFileName, startByte, endBytes);
        }
      }
    }

### Node.js

For more information, see the
[Cloud Storage Node.js API
reference documentation](https://cloud.google.com/nodejs/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    /**
     * TODO(developer): Uncomment the following lines before running the sample.
     */
    // The ID of your GCS bucket
    // const bucketName = 'your-unique-bucket-name';

    // The ID of your GCS file
    // const fileName = 'your-file-name';

    // The starting byte at which to begin the download
    // const startByte = 0;

    // The ending byte at which to end the download
    // const endByte = 20;

    // The path to which the file should be downloaded
    // const destFileName = '/local/path/to/file.txt';

    // Imports the Google Cloud client library
    const {Storage} = require('https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/overview.html');

    // Creates a client
    const storage = new https://docs.cloud.google.com/nodejs/docs/reference/storage-control/latest/storage-control/protos.google.storage.v2.storage-class.html();

    async function downloadByteRange() {
      const options = {
        destination: destFileName,
        start: startByte,
        end: endByte,
      };

      // Downloads the file from the starting byte to the ending byte specified in options
      await storage.bucket(bucketName).file(fileName).https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/file_2.html(options);

      console.log(
        `gs://${bucketName}/${fileName} downloaded to ${destFileName} from byte ${startByte} to byte ${endByte}.`
      );
    }

    downloadByteRange();

### PHP

For more information, see the
[Cloud Storage PHP API
reference documentation](https://googleapis.github.io/google-cloud-php/#/docs/google-cloud/latest/storage/storageclient).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    use Google\Cloud\Storage\StorageClient;

    /**
     * Download a byte range from Cloud Storage and save it as a local file.
     *
     * @param string $bucketName The name of your Cloud Storage bucket.
     *        (e.g. 'my-bucket')
     * @param string $objectName The name of your Cloud Storage object.
     *        (e.g. 'my-object')
     * @param int $startByte The starting byte at which to begin the download.
     *        (e.g. 1)
     * @param int $endByte The ending byte at which to end the download. (e.g. 5)
     * @param string $destination The local destination to save the object.
     *        (e.g. '/path/to/your/file')
     */
    function download_byte_range(
        string $bucketName,
        string $objectName,
        int $startByte,
        int $endByte,
        string $destination
    ): void {
        $storage = new StorageClient();
        $bucket = $storage->bucket($bucketName);
        $object = $bucket->object($objectName);
        $object->downloadToFile($destination, [
            'restOptions' => [
                'headers' => [
                    'Range' => "bytes=$startByte-$endByte",
                ],
            ],
        ]);
        printf(
            'Downloaded gs://%s/%s to %s' . PHP_EOL,
            $bucketName,
            $objectName,
            basename($destination)
        );
    }

### Python

For more information, see the
[Cloud Storage Python API
reference documentation](https://cloud.google.com/python/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    from google.cloud import https://docs.cloud.google.com/python/docs/reference/storage/latest


    def download_byte_range(
        bucket_name, source_blob_name, start_byte, end_byte, destination_file_name
    ):
        """Downloads a blob from the bucket."""
        # The ID of your GCS bucket
        # bucket_name = "your-bucket-name"

        # The ID of your GCS object
        # source_blob_name = "storage-object-name"

        # The starting byte at which to begin the download
        # start_byte = 0

        # The ending byte at which to end the download
        # end_byte = 20

        # The path to which the file should be downloaded
        # destination_file_name = "local/path/to/file"

        storage_client = https://docs.cloud.google.com/python/docs/reference/storage/latest.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html()

        bucket = storage_client.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html#google_cloud_storage_client_Client_bucket(bucket_name)

        # Construct a client side representation of a blob.
        # Note `Bucket.blob` differs from `Bucket.get_blob` as it doesn't retrieve
        # any content from Google Cloud Storage. As we don't need additional data,
        # using `Bucket.blob` is preferred here.
        blob = bucket.blob(source_blob_name)
        blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_download_to_filename(destination_file_name, start=start_byte, end=end_byte)

        print(
            "Downloaded bytes {} to {} of object {} from bucket {} to local file {}.".format(
                start_byte, end_byte, source_blob_name, bucket_name, destination_file_name
            )
        )

### Ruby

For more information, see the
[Cloud Storage Ruby API
reference documentation](https://googleapis.dev/ruby/google-cloud-storage/latest/Google/Cloud/Storage.html).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    # The ID of your GCS bucket
    # bucket_name = "your-unique-bucket-name"

    # file_name = "Name of a file in the Storage bucket"

    # The starting byte at which to begin the download
    # start_byte = 0

    # The ending byte at which to end the download
    # end_byte = 20

    # The path to which the file should be downloaded
    # local_file_path = "/local/path/to/file.txt"

    require "google/cloud/storage"

    storage = Google::Cloud::https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage-control-v2/latest/Google-Cloud-Storage.html.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage.html
    bucket  = storage.bucket bucket_name
    file    = bucket.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-Bucket.html file_name

    file.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-File.html local_file_path, range: start_byte..end_byte

    puts "Downloaded bytes #{start_byte} to #{end_byte} of object #{file_name} from bucket #{bucket_name}" \
         + " to local file #{local_file_path}."

### Rust

    use google_cloud_storage::client::Storage;
    use google_cloud_storage::model_ext::ReadRange;

    pub async fn sample(
        client: &Storage,
        bucket: &str,
        object: &str,
        start: u64,
        end: u64,
    ) -> Result<(), anyhow::Error> {
        let count = end - start + 1;
        let mut reader = client
            .read_object(format!("projects/_/buckets/{bucket}"), object)
            .set_read_range(ReadRange::segment(start, count))
            .send()
            .await?;

        let mut content = Vec::new();
        while let Some(data) = reader.next().await.transpose()? {
            content.extend_from_slice(&data);
        }

        println!(
            "Downloaded {} bytes from {start} to {end} of object {object} in bucket {bucket}.",
            content.len()
        );
        Ok(())
    }

<br />

### REST APIs

### JSON API

Use the [`Range` header](https://docs.cloud.google.com/storage/docs/json_api/v1/parameters#range) in your request to download a portion of
an object.

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](https://curl.haxx.se/) to call the [JSON API](https://docs.cloud.google.com/storage/docs/json_api) with a
   [`GET` Object](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/get) request:

   ```
   curl -X GET \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "Range: bytes=FIRST_BYTE-LAST_BYTE" \
     -o "SAVE_TO_LOCATION" \
     "https://storage.googleapis.com/storage/v1/b/BUCKET_NAME/o/OBJECT_NAME?alt=media"
   ```

   Where:
   - `FIRST_BYTE` is the first byte in the range of bytes you want to download. For example, `1000`.
   - `LAST_BYTE` is the last byte in the range of bytes you want to download. For example, `1999`.
   - `SAVE_TO_LOCATION` is the path to the location where you want to save your object. For example, `Desktop/dog.png`.
   - `BUCKET_NAME` is the name of the bucket containing the object you are downloading. For example, `my-bucket`.
   - `OBJECT_NAME` is the URL-encoded name of the object you are downloading. For example, `pets/dog.png`, URL-encoded as `pets%2Fdog.png`.

> [!NOTE]
> **Note:** If [object transcoding](https://docs.cloud.google.com/storage/docs/transcoding) occurs, the `Range` header is silently ignored and the response instead serves the entire requested object.

### XML API

Use the [`Range` header](https://docs.cloud.google.com/storage/docs/xml-api/reference-headers#range) in your request to download a portion of
an object.

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](https://curl.haxx.se/) to call the [XML API](https://docs.cloud.google.com/storage/docs/xml-api/overview) with a
   [`GET` Object](https://docs.cloud.google.com/storage/docs/xml-api/get-object-download) request:

   ```
   curl -X GET \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "Range: bytes=FIRST_BYTE-LAST_BYTE" \
     -o "SAVE_TO_LOCATION" \
     "https://storage.googleapis.com/BUCKET_NAME/OBJECT_NAME"
   ```

   Where:
   - `FIRST_BYTE` is the first byte in the range of bytes you want to download. For example, `1000`.
   - `LAST_BYTE` is the last byte in the range of bytes you want to download. For example, `1999`.
   - `SAVE_TO_LOCATION` is the path to the location where you want to save your object. For example, `$HOME/Desktop/dog.png`.
   - `BUCKET_NAME` is the name of the bucket containing the object you are downloading. For example, `my-bucket`.
   - `OBJECT_NAME` is the URL-encoded name of the object you are downloading. For example, `pets/dog.png`, URL-encoded as `pets%2Fdog.png`.

> [!NOTE]
> **Note:** If [object transcoding](https://docs.cloud.google.com/storage/docs/transcoding) occurs, the `Range` header is silently ignored and the response instead serves the entire requested object.

## Read an object without downloading it

This section shows you how to read an object's data from Cloud Storage
without downloading the object.

### Console

1. In the Google Cloud console, go to the Cloud Storage **Buckets** page.

   [Go to Buckets](https://console.cloud.google.com/storage/browser)

2. In the bucket list, click the name of the bucket whose contents you
   want to view.

3. On the **Objects** tab, click the name of the object you want to read.

4. On the **Object details** page, click the public URL or the authenticated
   URL of the object to read its data.

### Command line

Use the [`gcloud storage cat`](https://docs.cloud.google.com/sdk/gcloud/reference/storage/cat) command:

```
gcloud storage cat gs://BUCKET_NAME/OBJECT_NAME
```

Replace the following:

- `BUCKET_NAME`: the name of the bucket that
  contains the object you want to read. For example, `my-bucket`.

- `OBJECT_NAME`: the name of the object that
  you want to read. For example, `dog.png`.

### REST APIs

### JSON API

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](https://curl.haxx.se/) to call the [JSON API](https://docs.cloud.google.com/storage/docs/json_api) with a
   [`GET` Object](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/get) request that includes the `alt=media` query
   parameter:

   ```
   curl -X GET -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     "https://storage.googleapis.com/storage/v1/b/BUCKET_NAME/o/OBJECT_NAME?alt=media"
   ```

   Replace the following:
   - `BUCKET_NAME`: the name of the bucket
     that contains the object you want to read. For example,
     `my-bucket`.

   - `OBJECT_NAME`: the URL-encoded name of
     the object you want to read. For example, `pets/dog.png`,
     URL-encoded as `pets%2Fdog.png`.

### XML API

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](https://curl.haxx.se/) to call the [XML API](https://docs.cloud.google.com/storage/docs/xml-api/overview) with a
   [`GET` Object](https://docs.cloud.google.com/storage/docs/xml-api/get-object-download) request that _excludes_ the `-o` flag:

   ```
   curl -X GET \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     "https://storage.googleapis.com/BUCKET_NAME/OBJECT_NAME"
   ```

   Replace the following:
   - `BUCKET_NAME`: the name of the bucket
     containing the object you want to read. For example,
     `my-bucket`.

   - `OBJECT_NAME`: the URL-encoded name of
     the object you want to read. For example, `pets/dog.png`,
     URL-encoded as `pets%2Fdog.png`.

## What's next

- Learn more about [object downloads](https://docs.cloud.google.com/storage/docs/downloads).
- [Transfer data from cloud providers or other online sources](https://docs.cloud.google.com/storage-transfer/docs/create-manage-transfer-console), such as URL lists.
- [Transfer objects to your Compute Engine instance](https://docs.cloud.google.com/compute/docs/instances/transfer-files#gcstransfer).
- Learn how you can [bill Cloud Storage access charges to requesters](https://docs.cloud.google.com/storage/docs/requester-pays).
- Learn how Cloud Storage can [serve gzipped files in an uncompressed state](https://docs.cloud.google.com/storage/docs/transcoding).
