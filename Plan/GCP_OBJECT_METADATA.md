[Concepts](https://docs.cloud.google.com/storage/docs/metadata)

This page describes how to view and edit the metadata associated with objects
stored in Cloud Storage.

This page does not cover viewing or editing Identity and Access Management (IAM)
policies or object Access Control Lists (ACLs), both of which control who
is allowed to access your data. See [Identity and Access Management](https://docs.cloud.google.com/storage/docs/access-control/iam) and
[Creating and Managing ACLs](https://docs.cloud.google.com/storage/docs/access-control/create-manage-lists) for guides to accomplishing these tasks.

## Required roles

In order to get the required permissions for viewing and editing the metadata of
objects, ask your administrator to grant you the Storage Object User
(`roles/storage.objectUser`) role on the bucket.

This role contains the permissions required to view and edit the metadata of
objects. To see the exact permissions that are required, expand the
**Required permissions** section:

#### Required permissions

- `storage.buckets.list`
  - This permission is only required if you plan on using the Google Cloud console to perform the tasks on this page.
- `storage.objects.get`
- `storage.objects.getIamPolicy`
  - This permission is only required if you want to return an object's [IAM policies](https://docs.cloud.google.com/iam/docs/overview).
- `storage.objects.list`
- `storage.objects.setRetention`
  - This permission is only required if you want to set an object's [retention configuration](https://docs.cloud.google.com/storage/docs/object-lock).
- `storage.objects.update`
- `storage.objects.createContext`, `storage.objects.updateContext`, `storage.objects.deleteContext`
  - These permissions are required to manage [object contexts](https://docs.cloud.google.com/storage/docs/object-contexts).
- `storage.objects.dropContexts`
  - This permission is required to drop source object contexts during a rewrite, copy, or compose operation.

You might also be able to get these permissions with other
[predefined roles](https://docs.cloud.google.com/iam/docs/understanding-roles) or [custom roles](https://docs.cloud.google.com/iam/docs/creating-custom-roles).

For instructions on granting roles on buckets, see
[Set and manage IAM policies on buckets](https://docs.cloud.google.com/storage/docs/access-control/using-iam-permissions).

## View object metadata

Complete the following instructions to view the metadata associated with an
object:

### Console

1. In the Google Cloud console, go to the Cloud Storage **Buckets** page.

   [Go to Buckets](https://console.cloud.google.com/storage/browser)

2. In the list of buckets, click the name of the bucket that contains
   the object for which you want to view metadata.

   The **Bucket details** page opens, with the **Objects** tab selected.

3. Navigate to the object, which might be located in a folder.

   Certain object metadata values, such as the object's size and
   storage class, are displayed along with the object's name.

4. Click the name of the object.

   The **Object details** page opens, which displays additional object
   metadata.

5. Click **Edit metadata**.

   The overlay window that appears shows the current values for several
   more object metadata keys, including custom metadata.

To learn how to get detailed error information about failed Cloud Storage
operations in the Google Cloud console, see
[Troubleshooting](https://docs.cloud.google.com/storage/docs/troubleshooting#trouble-console).

### Command line

Use the [`gcloud storage objects describe`](https://docs.cloud.google.com/sdk/gcloud/reference/storage/objects/describe) command:

```
gcloud storage objects describe gs://BUCKET_NAME/OBJECT_NAME
```

Where:

- `BUCKET_NAME` is the name of the bucket containing the object whose metadata you want to view. For example, `my-awesome-bucket`.
- `OBJECT_NAME` is the name of the object whose metadata you want to view. For example, `cat.jpeg`.

If successful, the response looks similar to the following example:

```
bucket: my-awesome-bucket
content_type: image/png
crc32c_hash: pNKjPQ==
creation_time: 2024-01-26T21:33:04+0000
custom_fields:
  Animal: Cat
  Type: Cute
custom_time: 1970-01-01T00:00:00+0000
etag: CMXyydSA/IMDEAE=
generation: '1706304784726341'
md5_hash: KCbI3PYk1aHfekIvf/osrw==
metageneration: 1
name: kitten.png
size: 168276
storage_class: STANDARD
storage_class_update_time: 2024-01-26T21:33:04+0000
storage_url: gs://my-awesome-bucket/kitten.png#1706304784726341
update_time: 2024-01-26T21:33:04+0000
```

### Client libraries

### C++

For more information, see the
[Cloud Storage C++ API
reference documentation](https://docs.cloud.google.com/cpp/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    namespace gcs = ::google::cloud::storage;
    using ::google::cloud::StatusOr;
    [](gcs::Client client, std::string const& bucket_name,
       std::string const& object_name) {
      StatusOr<gcs::ObjectMetadata> object_metadata =
          client.GetObjectMetadata(bucket_name, object_name);
      if (!object_metadata) throw std::move(object_metadata).status();

      std::cout << "The metadata for object " << object_metadata->name()
                << " in bucket " << object_metadata->bucket() << " is "
                << *object_metadata << "\n";
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

    public class GetMetadataSample
    {
        public Google.Apis.Storage.v1.Data.Object GetMetadata(
            string bucketName = "your-unique-bucket-name",
            string objectName = "your-object-name")
        {
            var storage = https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html#Google_Cloud_Storage_V1_StorageClient_Create();
            var storageObject = storage.GetObject(bucketName, objectName, new https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.GetObjectOptions.html { Projection = https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.Projection.html.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.Projection.html#Google_Cloud_Storage_V1_Projection_Full });
            Console.WriteLine($"Bucket:\t{storageObject.Bucket}");
            Console.WriteLine($"CacheControl:\t{storageObject.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.UrlSigner.PostPolicyStandardElement.html#Google_Cloud_Storage_V1_UrlSigner_PostPolicyStandardElement_CacheControl}");
            Console.WriteLine($"ComponentCount:\t{storageObject.ComponentCount}");
            Console.WriteLine($"ContentDisposition:\t{storageObject.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.UrlSigner.PostPolicyStandardElement.html#Google_Cloud_Storage_V1_UrlSigner_PostPolicyStandardElement_ContentDisposition}");
            Console.WriteLine($"ContentEncoding:\t{storageObject.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.UrlSigner.PostPolicyStandardElement.html#Google_Cloud_Storage_V1_UrlSigner_PostPolicyStandardElement_ContentEncoding}");
            Console.WriteLine($"ContentLanguage:\t{storageObject.ContentLanguage}");
            Console.WriteLine($"ContentType:\t{storageObject.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.UrlSigner.PostPolicyStandardElement.html#Google_Cloud_Storage_V1_UrlSigner_PostPolicyStandardElement_ContentType}");
            Console.WriteLine($"Crc32c:\t{storageObject.Crc32c}");
            Console.WriteLine($"ETag:\t{storageObject.ETag}");
            Console.WriteLine($"Generation:\t{storageObject.Generation}");
            Console.WriteLine($"Id:\t{storageObject.Id}");
            Console.WriteLine($"Kind:\t{storageObject.Kind}");
            Console.WriteLine($"KmsKeyName:\t{storageObject.KmsKeyName}");
            Console.WriteLine($"Md5Hash:\t{storageObject.Md5Hash}");
            Console.WriteLine($"MediaLink:\t{storageObject.MediaLink}");
            Console.WriteLine($"Metageneration:\t{storageObject.Metageneration}");
            Console.WriteLine($"Name:\t{storageObject.Name}");
            Console.WriteLine($"Retention:\t{storageObject.Retention}");
            Console.WriteLine($"Size:\t{storageObject.Size}");
            Console.WriteLine($"StorageClass:\t{storageObject.StorageClass}");
            Console.WriteLine($"TimeCreated:\t{storageObject.TimeCreated}");
            Console.WriteLine($"Updated:\t{storageObject.Updated}");
            bool eventBasedHold = storageObject.EventBasedHold ?? false;
            Console.WriteLine("Event-based hold enabled? {0}", eventBasedHold);
            bool temporaryHold = storageObject.TemporaryHold ?? false;
            Console.WriteLine("Temporary hold enabled? {0}", temporaryHold);
            Console.WriteLine($"RetentionExpirationTime\t{storageObject.RetentionExpirationTime}");
            if (storageObject.Metadata != null)
            {
                Console.WriteLine("Metadata: ");
                foreach (var metadata in storageObject.Metadata)
                {
                    Console.WriteLine($"{metadata.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.UrlSigner.PostPolicyStandardElement.html#Google_Cloud_Storage_V1_UrlSigner_PostPolicyStandardElement_Key}:\t{metadata.Value}");
                }
            }
            Console.WriteLine($"CustomTime:\t{storageObject.CustomTime}");
            return storageObject;
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
    	"time"

    	"cloud.google.com/go/storage"
    )

    // getMetadata prints all of the object attributes.
    func getMetadata(w io.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Writer, bucket, object string) (*storage.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_ObjectAttrs, error) {
    	// bucket := "bucket-name"
    	// object := "object-name"
    	ctx := context.Background()
    	client, err := storage.NewClient(ctx)
    	if err != nil {
    		return nil, fmt.Errorf("storage.NewClient: %w", err)
    	}
    	defer client.Close()

    	ctx, cancel := context.WithTimeout(ctx, time.Second*10)
    	defer cancel()

    	o := client.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Client_Bucket(bucket).https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_BucketHandle_Object(object)
    	attrs, err := o.Attrs(ctx)
    	if err != nil {
    		return nil, fmt.Errorf("Object(%q).Attrs: %w", object, err)
    	}
    	fmt.Fprintf(w, "Bucket: %v\n", attrs.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Client_Bucket)
    	fmt.Fprintf(w, "CacheControl: %v\n", attrs.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Reader_CacheControl)
    	fmt.Fprintf(w, "ContentDisposition: %v\n", attrs.ContentDisposition)
    	fmt.Fprintf(w, "ContentEncoding: %v\n", attrs.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Reader_ContentEncoding)
    	fmt.Fprintf(w, "ContentLanguage: %v\n", attrs.ContentLanguage)
    	fmt.Fprintf(w, "ContentType: %v\n", attrs.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Reader_ContentType)
    	fmt.Fprintf(w, "Crc32c: %v\n", attrs.CRC32C)
    	fmt.Fprintf(w, "Generation: %v\n", attrs.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_ObjectHandle_Generation)
    	fmt.Fprintf(w, "KmsKeyName: %v\n", attrs.KMSKeyName)
    	fmt.Fprintf(w, "Md5Hash: %v\n", attrs.MD5)
    	fmt.Fprintf(w, "MediaLink: %v\n", attrs.MediaLink)
    	fmt.Fprintf(w, "Metageneration: %v\n", attrs.Metageneration)
    	fmt.Fprintf(w, "Name: %v\n", attrs.Name)
    	fmt.Fprintf(w, "Size: %v\n", attrs.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Reader_Size)
    	fmt.Fprintf(w, "StorageClass: %v\n", attrs.StorageClass)
    	fmt.Fprintf(w, "TimeCreated: %v\n", attrs.Created)
    	fmt.Fprintf(w, "Updated: %v\n", attrs.Updated)
    	fmt.Fprintf(w, "Event-based hold enabled? %t\n", attrs.EventBasedHold)
    	fmt.Fprintf(w, "Temporary hold enabled? %t\n", attrs.TemporaryHold)
    	fmt.Fprintf(w, "Retention expiration time %v\n", attrs.RetentionExpirationTime)
    	fmt.Fprintf(w, "Custom time %v\n", attrs.CustomTime)
    	fmt.Fprintf(w, "Retention: %+v\n", attrs.Retention)
    	fmt.Fprintf(w, "\n\nMetadata\n")
    	for key, value := range attrs.Metadata {
    		fmt.Fprintf(w, "\t%v = %v\n", key, value)
    	}
    	return attrs, nil
    }

### Java

For more information, see the
[Cloud Storage Java API
reference documentation](https://cloud.google.com/java/docs/reference/google-cloud-storage/latest/overview).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageException.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html;
    import java.util.Date;
    import java.util.Map;

    public class GetObjectMetadata {
      public static void getObjectMetadata(String projectId, String bucketName, String blobName)
          throws https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageException.html {
        // The ID of your GCP project
        // String projectId = "your-project-id";

        // The ID of your GCS bucket
        // String bucketName = "your-unique-bucket-name";

        // The ID of your GCS object
        // String objectName = "your-object-name";

        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html storage = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html.newBuilder().setProjectId(projectId).build().https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html#com_google_cloud_storage_transfermanager_TransferManagerConfig_getService__();

        // Select all fields
        // Fields can be selected individually e.g. Storage.BlobField.CACHE_CONTROL
        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html blob =
            storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html#com_google_cloud_storage_Storage_get_com_google_cloud_storage_BlobId_(bucketName, blobName, Storage.BlobGetOption.fields(Storage.BlobField.values()));

        // Print blob metadata
        System.out.println("Bucket: " + blob.getBucket());
        System.out.println("CacheControl: " + blob.getCacheControl());
        System.out.println("ComponentCount: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getComponentCount__());
        System.out.println("ContentDisposition: " + blob.getContentDisposition());
        System.out.println("ContentEncoding: " + blob.getContentEncoding());
        System.out.println("ContentLanguage: " + blob.getContentLanguage());
        System.out.println("ContentType: " + blob.getContentType());
        System.out.println("CustomTime: " + blob.getCustomTime());
        System.out.println("Crc32c: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getCrc32c__());
        System.out.println("Crc32cHexString: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getCrc32cToHexString__());
        System.out.println("ETag: " + blob.getEtag());
        System.out.println("Generation: " + blob.getGeneration());
        System.out.println("Id: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getBlobId__());
        System.out.println("KmsKeyName: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getKmsKeyName__());
        System.out.println("Md5Hash: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getMd5__());
        System.out.println("Md5HexString: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getMd5ToHexString__());
        System.out.println("MediaLink: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getMediaLink__());
        System.out.println("Metageneration: " + blob.getMetageneration());
        System.out.println("Name: " + blob.getName());
        System.out.println("Size: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getSize__());
        System.out.println("StorageClass: " + blob.getStorageClass());
        System.out.println("TimeCreated: " + new Date(blob.getCreateTime()));
        System.out.println("Last Metadata Update: " + new Date(blob.getUpdateTime()));
        System.out.println("Object Retention Policy: " + blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getRetention__());
        Boolean temporaryHoldIsEnabled = (blob.getTemporaryHold() != null && blob.getTemporaryHold());
        System.out.println("temporaryHold: " + (temporaryHoldIsEnabled ? "enabled" : "disabled"));
        Boolean eventBasedHoldIsEnabled =
            (blob.getEventBasedHold() != null && blob.getEventBasedHold());
        System.out.println("eventBasedHold: " + (eventBasedHoldIsEnabled ? "enabled" : "disabled"));
        if (blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getRetentionExpirationTime__() != null) {
          System.out.println("retentionExpirationTime: " + new Date(blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getRetentionExpirationTime__()));
        }
        if (blob.getMetadata() != null) {
          System.out.println("\n\n\nUser metadata:");
          for (Map.Entry<String, String> userMetadata : blob.getMetadata().entrySet()) {
            System.out.println(userMetadata.getKey() + "=" + userMetadata.getValue());
          }
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

    // Imports the Google Cloud client library
    const {Storage} = require('https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/overview.html');

    // Creates a client
    const storage = new https://docs.cloud.google.com/nodejs/docs/reference/storage-control/latest/storage-control/protos.google.storage.v2.storage-class.html();

    async function getMetadata() {
      // Gets the metadata for the file
      const [metadata] = await storage
        .bucket(bucketName)
        .file(fileName)
        .getMetadata();

      console.log(`Bucket: ${metadata.bucket}`);
      console.log(`CacheControl: ${metadata.cacheControl}`);
      console.log(`ComponentCount: ${metadata.componentCount}`);
      console.log(`ContentDisposition: ${metadata.contentDisposition}`);
      console.log(`ContentEncoding: ${metadata.contentEncoding}`);
      console.log(`ContentLanguage: ${metadata.contentLanguage}`);
      console.log(`ContentType: ${metadata.contentType}`);
      console.log(`CustomTime: ${metadata.customTime}`);
      console.log(`Crc32c: ${metadata.crc32c}`);
      console.log(`ETag: ${metadata.etag}`);
      console.log(`Generation: ${metadata.generation}`);
      console.log(`Id: ${metadata.id}`);
      console.log(`KmsKeyName: ${metadata.kmsKeyName}`);
      console.log(`Md5Hash: ${metadata.md5Hash}`);
      console.log(`MediaLink: ${metadata.https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/filemetadata.html}`);
      console.log(`Metageneration: ${metadata.metageneration}`);
      console.log(`Name: ${metadata.name}`);
      console.log(`Size: ${metadata.size}`);
      console.log(`StorageClass: ${metadata.storageClass}`);
      console.log(`TimeCreated: ${new Date(metadata.timeCreated)}`);
      console.log(`Last Metadata Update: ${new Date(metadata.updated)}`);
      console.log(`TurboReplication: ${metadata.rpo}`);
      console.log(
        `temporaryHold: ${metadata.temporaryHold ? 'enabled' : 'disabled'}`
      );
      console.log(
        `eventBasedHold: ${metadata.eventBasedHold ? 'enabled' : 'disabled'}`
      );
      if (metadata.https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/filemetadata.html) {
        console.log(
          `retentionExpirationTime: ${new Date(metadata.https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/filemetadata.html)}`
        );
      }
      if (metadata.metadata) {
        console.log('\n\n\nUser metadata:');
        for (const key in metadata.metadata) {
          console.log(`${key}=${metadata.metadata[key]}`);
        }
      }
    }

    getMetadata().catch(console.error);

### PHP

For more information, see the
[Cloud Storage PHP API
reference documentation](https://googleapis.github.io/google-cloud-php/#/docs/google-cloud/latest/storage/storageclient).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    use Google\Cloud\Storage\StorageClient;

    /**
     * List object metadata.
     *
     * @param string $bucketName The name of your Cloud Storage bucket.
     *        (e.g. 'my-bucket')
     * @param string $objectName The name of your Cloud Storage object.
     *        (e.g. 'my-object')
     */
    function object_metadata(string $bucketName, string $objectName): void
    {
        $storage = new StorageClient();
        $bucket = $storage->bucket($bucketName);
        $object = $bucket->object($objectName);
        $info = $object->info();
        if (isset($info['name'])) {
            printf('Blob: %s' . PHP_EOL, $info['name']);
        }
        if (isset($info['bucket'])) {
            printf('Bucket: %s' . PHP_EOL, $info['bucket']);
        }
        if (isset($info['storageClass'])) {
            printf('Storage class: %s' . PHP_EOL, $info['storageClass']);
        }
        if (isset($info['id'])) {
            printf('ID: %s' . PHP_EOL, $info['id']);
        }
        if (isset($info['size'])) {
            printf('Size: %s' . PHP_EOL, $info['size']);
        }
        if (isset($info['updated'])) {
            printf('Updated: %s' . PHP_EOL, $info['updated']);
        }
        if (isset($info['generation'])) {
            printf('Generation: %s' . PHP_EOL, $info['generation']);
        }
        if (isset($info['metageneration'])) {
            printf('Metageneration: %s' . PHP_EOL, $info['metageneration']);
        }
        if (isset($info['etag'])) {
            printf('Etag: %s' . PHP_EOL, $info['etag']);
        }
        if (isset($info['crc32c'])) {
            printf('Crc32c: %s' . PHP_EOL, $info['crc32c']);
        }
        if (isset($info['md5Hash'])) {
            printf('MD5 Hash: %s' . PHP_EOL, $info['md5Hash']);
        }
        if (isset($info['contentType'])) {
            printf('Content-type: %s' . PHP_EOL, $info['contentType']);
        }
        if (isset($info['temporaryHold'])) {
            printf('Temporary hold: %s' . PHP_EOL, ($info['temporaryHold'] ? 'enabled' : 'disabled'));
        }
        if (isset($info['eventBasedHold'])) {
            printf('Event-based hold: %s' . PHP_EOL, ($info['eventBasedHold'] ? 'enabled' : 'disabled'));
        }
        if (isset($info['retentionExpirationTime'])) {
            printf('Retention Expiration Time: %s' . PHP_EOL, $info['retentionExpirationTime']);
        }
        if (isset($info['retention'])) {
            printf('Retention mode: %s' . PHP_EOL, $info['retention']['mode']);
            printf('Retain until time is: %s' . PHP_EOL, $info['retention']['retainUntilTime']);
        }
        if (isset($info['customTime'])) {
            printf('Custom Time: %s' . PHP_EOL, $info['customTime']);
        }
        if (isset($info['metadata'])) {
            printf('Metadata: %s' . PHP_EOL, print_r($info['metadata'], true));
        }
    }

### Python

For more information, see the
[Cloud Storage Python API
reference documentation](https://cloud.google.com/python/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    from google.cloud import https://docs.cloud.google.com/python/docs/reference/storage/latest


    def blob_metadata(bucket_name, blob_name):
        """Prints out a blob's metadata."""
        # bucket_name = 'your-bucket-name'
        # blob_name = 'your-object-name'

        storage_client = https://docs.cloud.google.com/python/docs/reference/storage/latest.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html()
        bucket = storage_client.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html#google_cloud_storage_client_Client_bucket(bucket_name)

        # Retrieve a blob, and its metadata, from Google Cloud Storage.
        # Note that `get_blob` differs from `Bucket.blob`, which does not
        # make an HTTP request.
        blob = bucket.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.bucket.Bucket.html#google_cloud_storage_bucket_Bucket_get_blob(blob_name)

        print(f"Blob: {blob.name}")
        print(f"Blob finalization: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_finalized_time}")
        print(f"Bucket: {blob.bucket.name}")
        print(f"Storage class: {blob.storage_class}")
        print(f"ID: {blob.id}")
        print(f"Size: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_size} bytes")
        print(f"Updated: {blob.updated}")
        print(f"Generation: {blob.generation}")
        print(f"Metageneration: {blob.metageneration}")
        print(f"Etag: {blob.etag}")
        print(f"Owner: {blob.owner}")
        print(f"Component count: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_component_count}")
        print(f"Crc32c: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_crc32c}")
        print(f"md5_hash: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_md5_hash}")
        print(f"Cache-control: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_cache_control}")
        print(f"Content-type: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_content_type}")
        print(f"Content-disposition: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_content_disposition}")
        print(f"Content-encoding: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_content_encoding}")
        print(f"Content-language: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_content_language}")
        print(f"Metadata: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_metadata}")
        print(f"Medialink: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_media_link}")
        print(f"Custom Time: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_custom_time}")
        print("Temporary hold: ", "enabled" if blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_temporary_hold else "disabled")
        print(
            "Event based hold: ",
            "enabled" if blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_event_based_hold else "disabled",
        )
        print(f"Retention mode: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_retention.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Retention.html#google_cloud_storage_blob_Retention_mode}")
        print(f"Retention retain until time: {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_retention.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Retention.html#google_cloud_storage_blob_Retention_retain_until_time}")
        if blob.retention_expiration_time:
            print(
                f"retentionExpirationTime: {blob.retention_expiration_time}"
            )

### Ruby

For more information, see the
[Cloud Storage Ruby API
reference documentation](https://googleapis.dev/ruby/google-cloud-storage/latest/Google/Cloud/Storage.html).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    def get_metadata bucket_name:, file_name:
      # The ID of your GCS bucket
      # bucket_name = "your-unique-bucket-name"

      # The ID of your GCS object
      # file_name = "your-file-name"

      require "google/cloud/storage"

      storage = Google::Cloud::https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage-control-v2/latest/Google-Cloud-Storage.html.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage.html
      bucket  = storage.bucket bucket_name
      file    = bucket.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-Bucket.html file_name

      puts "Name: #{file.name}"
      puts "Bucket: #{bucket.name}"
      puts "Storage class: #{bucket.storage_class}"
      puts "ID: #{file.id}"
      puts "Size: #{file.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-File.html} bytes"
      puts "Created: #{file.created_at}"
      puts "Updated: #{file.updated_at}"
      puts "Generation: #{file.generation}"
      puts "Metageneration: #{file.metageneration}"
      puts "Etag: #{file.etag}"
      puts "Owners: #{file.acl.owners.join ','}"
      puts "Crc32c: #{file.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-File.html}"
      puts "md5_hash: #{file.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-File.html}"
      puts "Cache-control: #{file.cache_control}"
      puts "Content-type: #{file.content_type}"
      puts "Contexts: #{file.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-File.html}"
      puts "Content-disposition: #{file.content_disposition}"
      puts "Content-encoding: #{file.content_encoding}"
      puts "Content-language: #{file.content_language}"
      puts "KmsKeyName: #{file.kms_key}"
      puts "Event-based hold enabled?: #{file.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-File.html}"
      puts "Temporary hold enaled?: #{file.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-File.html}"
      puts "Retention Expiration: #{file.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-File.html}"
      puts "Custom Time: #{file.custom_time}"
      puts "Metadata:"
      file.metadata.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-Policy-Bindings.html do |key, value|
        puts " - #{key} = #{value}"
      end
    end

### Rust

    use google_cloud_storage::client::StorageControl;

    pub async fn sample(client: &StorageControl, bucket_id: &str) -> anyhow::Result<()> {
        const NAME: &str = "object-to-read";
        let object = client
            .get_object()
            .set_bucket(format!("projects/_/buckets/{bucket_id}"))
            .set_object(NAME)
            .send()
            .await?;

        let object_metadata = object.metadata;
        println!(
            "successfully retrieved object {NAME} metadata in bucket {bucket_id}: {:?}",
            object_metadata
        );
        Ok(())
    }

<br />

### Terraform

You can use a [Terraform resource](https://registry.terraform.io/providers/hashicorp/google/latest/docs/data-sources/storage_bucket_object) to view an object's
metadata.

    # Get object metadata
    data "google_storage_bucket_object" "default" {
      name   = google_storage_bucket_object.default.name
      bucket = google_storage_bucket.static.id
    }

    output "object_metadata" {
      value = data.google_storage_bucket_object.default
    }

### REST APIs

### JSON API

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](http://curl.haxx.se/) to call the [JSON API](https://docs.cloud.google.com/storage/docs/json_api) with a
   [`GET` Object](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/get) request:

   ```
   curl -X GET \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     "https://storage.googleapis.com/storage/v1/b/BUCKET_NAME/o/OBJECT_NAME"
   ```

   Where:
   - `BUCKET_NAME` is the name of the bucket containing the object whose metadata you want to view. For example, `my-bucket`.
   - `OBJECT_NAME` is the URL-encoded name of the object whose metadata you want to view. For example, `pets/dog.png`, URL-encoded as `pets%2Fdog.png`.

### XML API

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](http://curl.haxx.se/) to call the [XML API](https://docs.cloud.google.com/storage/docs/xml-api/overview) with a
   [`HEAD` Object](https://docs.cloud.google.com/storage/docs/xml-api/head-object) request:

   ```
   curl -I HEAD \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     "https://storage.googleapis.com/BUCKET_NAME/OBJECT_NAME"
   ```

   Where:
   - `BUCKET_NAME` is the name of the bucket containing the object whose metadata you want to view. For example, `my-bucket`.
   - `OBJECT_NAME` is the URL-encoded name of the object whose metadata you want to view. For example, `pets/dog.png`, URL-encoded as `pets%2Fdog.png`.

## Edit object metadata

Complete the following steps to edit the metadata associated with an object:

### Console

1. In the Google Cloud console, go to the Cloud Storage **Buckets** page.

   [Go to Buckets](https://console.cloud.google.com/storage/browser)

2. In the list of buckets, click the name of the bucket that contains
   the object for which you want to edit metadata.

   The **Bucket details** page opens, with the **Objects** tab selected.

3. Navigate to the object, which might be located in a folder.

4. Click the name of the object.

   The **Object details** page opens, which displays object metadata.

5. Click the pencil icon associated with the metadata that you want to edit,
   if it appears on the page.

6. Otherwise, click **Edit metadata** to access additional editable
   metadata.

   In the overlay window that appears, edit the metadata as needed.
   - For standard metadata fields, edit the _Value_.

   - Add your own custom metadata by clicking the
     **Add
     item** button.

   - You can edit both the _Key_ and _Value_ of your custom metadata.

   - Delete your custom metadata by clicking the associated **X**.

   Once you are finished editing metadata in the overlay window, click
   **Save**.

To learn how to get detailed error information about failed Cloud Storage
operations in the Google Cloud console, see
[Troubleshooting](https://docs.cloud.google.com/storage/docs/troubleshooting#trouble-console).

### Command line

Use the [`gcloud storage objects update`](https://docs.cloud.google.com/sdk/gcloud/reference/storage/objects/update) command:

```
gcloud storage objects update gs://BUCKET_NAME/OBJECT_NAME METADATA_FLAG
```

Where:

- `BUCKET_NAME` is the name of the bucket containing the object whose metadata you want to edit. For example, `my-bucket`.
- `OBJECT_NAME` is the name of the object whose metadata you want to edit. For example, `pets/dog.png`.
- `METADATA_FLAG` is the flag for the metadata you want to edit. For example `--content-type=image/png`.

If successful, the response looks like the following example:

```
Patching gs://my-bucket/pets/dog.png#1560574162144861...
  Completed 1
```

For a complete list of metadata that you can update with this command,
see the [command reference page](https://docs.cloud.google.com/sdk/gcloud/reference/storage/objects/update).

### Client libraries

### C++

For more information, see the
[Cloud Storage C++ API
reference documentation](https://docs.cloud.google.com/cpp/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    namespace gcs = ::google::cloud::storage;
    using ::google::cloud::StatusOr;
    [](gcs::Client client, std::string const& bucket_name,
       std::string const& object_name, std::string const& key,
       std::string const& value) {
      StatusOr<gcs::ObjectMetadata> object_metadata =
          client.GetObjectMetadata(bucket_name, object_name);
      if (!object_metadata) throw std::move(object_metadata).status();

      gcs::ObjectMetadata desired = *object_metadata;
      desired.mutable_metadata().emplace(key, value);

      StatusOr<gcs::ObjectMetadata> updated =
          client.UpdateObject(bucket_name, object_name, desired,
                              gcs::Generation(object_metadata->generation()));

      if (!updated) throw std::move(updated).status();
      std::cout << "Object updated. The full metadata after the update is: "
                << *updated << "\n";
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
    using System.Collections.Generic;

    public class SetObjectMetadataSample
    {
        public Google.Apis.Storage.v1.Data.Object SetObjectMetadata(
            string bucketName = "your-bucket-name",
            string objectName = "your-object-name",
            string key = "key-to-add",
            string value = "value-to-add")
        {
            var storage = https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html#Google_Cloud_Storage_V1_StorageClient_Create();
            var file = storage.GetObject(bucketName, objectName);

            if (file.Metadata == null)
            {
                file.Metadata = new Dictionary<string, string>();
            }
            file.Metadata.Add(key, value);

            file = storage.UpdateObject(file);
            Console.WriteLine($"Updated custom metadata for object {objectName} in bucket {bucketName}");
            return file;
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
    	"time"

    	"cloud.google.com/go/storage"
    )

    // setMetadata sets an object's metadata.
    func setMetadata(w io.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Writer, bucket, object string) error {
    	// bucket := "bucket-name"
    	// object := "object-name"
    	ctx := context.Background()
    	client, err := storage.NewClient(ctx)
    	if err != nil {
    		return fmt.Errorf("storage.NewClient: %w", err)
    	}
    	defer client.Close()

    	ctx, cancel := context.WithTimeout(ctx, time.Second*10)
    	defer cancel()

    	o := client.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Client_Bucket(bucket).https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_BucketHandle_Object(object)

    	// Optional: set a metageneration-match precondition to avoid potential race
    	// conditions and data corruptions. The request to update is aborted if the
    	// object's metageneration does not match your precondition.
    	attrs, err := o.Attrs(ctx)
    	if err != nil {
    		return fmt.Errorf("object.Attrs: %w", err)
    	}
    	o = o.If(storage.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Conditions{MetagenerationMatch: attrs.Metageneration})

    	// Update the object to set the metadata.
    	objectAttrsToUpdate := storage.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_ObjectAttrsToUpdate{
    		Metadata: map[string]string{
    			"keyToAddOrUpdate": "value",
    		},
    	}
    	if _, err := o.Update(ctx, objectAttrsToUpdate); err != nil {
    		return fmt.Errorf("ObjectHandle(%q).Update: %w", object, err)
    	}
    	fmt.Fprintf(w, "Updated custom metadata for object %v in bucket %v.\n", object, bucket)
    	return nil
    }

### Java

For more information, see the
[Cloud Storage Java API
reference documentation](https://cloud.google.com/java/docs/reference/google-cloud-storage/latest/overview).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html;
    import java.util.HashMap;
    import java.util.Map;

    public class SetObjectMetadata {
      public static void setObjectMetadata(String projectId, String bucketName, String objectName) {
        // The ID of your GCP project
        // String projectId = "your-project-id";

        // The ID of your GCS bucket
        // String bucketName = "your-unique-bucket-name";

        // The ID of your GCS object
        // String objectName = "your-object-name";

        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html storage = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html.newBuilder().setProjectId(projectId).build().https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html#com_google_cloud_storage_transfermanager_TransferManagerConfig_getService__();
        Map<String, String> newMetadata = new HashMap<>();
        newMetadata.put("keyToAddOrUpdate", "value");
        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html blobId = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html.of(bucketName, objectName);
        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html blob = storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html#com_google_cloud_storage_Storage_get_com_google_cloud_storage_BlobId_(blobId);
        if (blob == null) {
          System.out.println("The object " + objectName + " was not found in " + bucketName);
          return;
        }

        // Optional: set a generation-match precondition to avoid potential race
        // conditions and data corruptions. The request to upload returns a 412 error if
        // the object's generation number does not match your precondition.
        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html.BlobTargetOption precondition = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html.BlobTargetOption.generationMatch();

        // Does an upsert operation, if the key already exists it's replaced by the new value, otherwise
        // it's added.
        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html pendingUpdate = blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html#com_google_cloud_storage_Blob_toBuilder__().setMetadata(newMetadata).build();
        storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html#com_google_cloud_storage_Storage_update_com_google_cloud_storage_BlobInfo_(pendingUpdate, precondition);

        System.out.println(
            "Updated custom metadata for object " + objectName + " in bucket " + bucketName);
      }
    }

### Node.js

For more information, see the
[Cloud Storage Node.js API
reference documentation](https://cloud.google.com/nodejs/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    // Imports the Google Cloud client library
    const {Storage} = require('https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/overview.html');

    // Creates a client
    const storage = new https://docs.cloud.google.com/nodejs/docs/reference/storage-control/latest/storage-control/protos.google.storage.v2.storage-class.html();

    /**
     * TODO(developer): Uncomment the following lines before running the sample.
     */
    // The ID of your GCS bucket
    // const bucketName = 'your-unique-bucket-name';

    // The ID of your GCS file
    // const fileName = 'your-file-name';

    async function setFileMetadata() {
      // Optional: set a meta-generation-match precondition to avoid potential race
      // conditions and data corruptions. The request to set metadata is aborted if the
      // object's metageneration number does not match your precondition.
      const options = {
        ifMetagenerationMatch: metagenerationMatchPrecondition,
      };

      // Set file metadata.
      const [metadata] = await storage
        .bucket(bucketName)
        .file(fileName)
        .setMetadata(
          {
            // Predefined metadata for server e.g. 'cacheControl', 'contentDisposition',
            // 'contentEncoding', 'contentLanguage', 'contentType'
            contentDisposition:
              'attachment; filename*=utf-8\'\'"anotherImage.jpg"',
            contentType: 'image/jpeg',

            // A note or actionable items for user e.g. uniqueId, object description,
            // or other useful information.
            metadata: {
              description: 'file description...',
              modified: '1900-01-01',
            },
          },
          options
        );

      console.log(
        'Updated metadata for object',
        fileName,
        'in bucket ',
        bucketName
      );
      console.log(metadata);
    }

    setFileMetadata().catch(console.error);

### PHP

For more information, see the
[Cloud Storage PHP API
reference documentation](https://googleapis.github.io/google-cloud-php/#/docs/google-cloud/latest/storage/storageclient).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    use Google\Cloud\Storage\StorageClient;

    /**
     * Set a metadata key and value on the specified object.
     *
     * @param string $bucketName The name of your Cloud Storage bucket.
     *        (e.g. 'my-bucket')
     * @param string $objectName The name of your Cloud Storage object.
     *        (e.g. 'my-object')
     */
    function set_metadata(string $bucketName, string $objectName): void
    {
        $storage = new StorageClient();
        $bucket = $storage->bucket($bucketName);
        $object = $bucket->object($objectName);
        $object->update([
            'metadata' => [
                'keyToAddOrUpdate' => 'value',
            ]
        ]);

        printf('Updated custom metadata for object %s in bucket %s', $objectName, $bucketName);
    }

### Python

For more information, see the
[Cloud Storage Python API
reference documentation](https://cloud.google.com/python/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    from google.cloud import https://docs.cloud.google.com/python/docs/reference/storage/latest


    def set_blob_metadata(bucket_name, blob_name):
        """Set a blob's metadata."""
        # bucket_name = 'your-bucket-name'
        # blob_name = 'your-object-name'

        storage_client = https://docs.cloud.google.com/python/docs/reference/storage/latest.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html()
        bucket = storage_client.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html#google_cloud_storage_client_Client_bucket(bucket_name)
        blob = bucket.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.bucket.Bucket.html#google_cloud_storage_bucket_Bucket_get_blob(blob_name)
        metageneration_match_precondition = None

        # Optional: set a metageneration-match precondition to avoid potential race
        # conditions and data corruptions. The request to patch is aborted if the
        # object's metageneration does not match your precondition.
        metageneration_match_precondition = blob.metageneration

        metadata = {'color': 'Red', 'name': 'Test'}
        blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_metadata = metadata
        blob.patch(if_metageneration_match=metageneration_match_precondition)

        print(f"The metadata for the blob {blob.name} is {blob.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob.html#google_cloud_storage_blob_Blob_metadata}")

### Ruby

For more information, see the
[Cloud Storage Ruby API
reference documentation](https://googleapis.dev/ruby/google-cloud-storage/latest/Google/Cloud/Storage.html).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    def set_metadata bucket_name:, file_name:
      # The ID of your GCS bucket
      # bucket_name = "your-unique-bucket-name"

      # The ID of your GCS object
      # file_name = "your-file-name"

      require "google/cloud/storage"

      storage = Google::Cloud::https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage-control-v2/latest/Google-Cloud-Storage.html.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage.html
      bucket  = storage.bucket bucket_name, skip_lookup: true
      file    = bucket.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-Bucket.html file_name

      file.update do |file|
        # Fixed key file metadata
        file.content_type = "text/plain"

        # Custom file metadata
        file.metadata["your-metadata-key"] = "your-metadata-value"
      end

      puts "Metadata for #{file_name} has been updated."
    end

### Rust

    use google_cloud_storage::client::StorageControl;
    use google_cloud_wkt::FieldMask;

    pub async fn sample(client: &StorageControl, bucket_id: &str) -> anyhow::Result<()> {
        const NAME: &str = "object-to-update";
        let object = client
            .get_object()
            .set_bucket(format!("projects/_/buckets/{bucket_id}"))
            .set_object(NAME)
            .send()
            .await?;

        let metageneration = object.metageneration;
        let mut meta = object.metadata.clone();
        meta.insert("updated".to_string(), "true".to_string());

        let updated = client
            .update_object()
            .set_if_metageneration_match(metageneration)
            .set_object(object.set_metadata(meta))
            .set_update_mask(FieldMask::default().set_paths(["metadata"]))
            .send()
            .await?;
        println!("successfully updated object {NAME} in bucket {bucket_id}: {updated:?}");
        Ok(())
    }

<br />

### REST APIs

### JSON API

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Create a JSON file that contains the metadata you
   want to modify. For more information about metadata associated with an object, see the [Cloud Storage Objects resource](https://docs.cloud.google.com/storage/docs/json_api/v1/objects).

   To add or modify the [fixed-key metadata](https://docs.cloud.google.com/storage/docs/metadata#mutable) such as `contentType`,
   use the following format:

   ```json
   {
     "STANDARD_METADATA_KEY": "STANDARD_METADATA_VALUE"
   }
   ```

   Where:
   - `STANDARD_METADATA_KEY` is the key for the metadata you want to add or modify. For example, `contentType`.
   - `STANDARD_METADATA_VALUE` is the value for the metadata you want to add or modify. For example, `image/png`.

   To add or modify custom metadata, use the following format:

   ```json
   {
     "metadata": {
       "CUSTOM_METADATA_KEY": "CUSTOM_METADATA_VALUE"
     }
   }
   ```

   Where:
   - `CUSTOM_METADATA_KEY` is the custom metadata key that you want to add or modify. For example, `dogbreed`.
   - `CUSTOM_METADATA_VALUE` is the value you want associated with the custom metadata key. For example, `shibainu`.

   To delete a custom metadata entry, use the following format:

   ```json
   {
     "metadata": {
       "CUSTOM_METADATA_KEY": null
     }
   }
   ```

   Where:
   - `CUSTOM_METADATA_KEY` is the key for the custom metadata that you want to delete. For example, `dogbreed`.

3. Use [`cURL`](http://curl.haxx.se/) to call the [JSON API](https://docs.cloud.google.com/storage/docs/json_api) with a
   [`PATCH` Object](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/patch) request:

   ```
   curl -X PATCH --data-binary @JSON_FILE_NAME \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "Content-Type: application/json" \
     "https://storage.googleapis.com/storage/v1/b/BUCKET_NAME/o/OBJECT_NAME"
   ```

   Where:
   - `JSON_FILE_NAME` is the path for the file that you created in Step 2.
   - `BUCKET_NAME` is the name of the bucket containing the object whose metadata you want to edit. For example, `my-bucket`.
   - `OBJECT_NAME` is the URL-encoded name of the object whose metadata you want to edit. For example, `pets/dog.png`, URL-encoded as `pets%2Fdog.png`.

Note that you can also change an object's metadata with an
[`UPDATE` Object](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/update) request. When using this method, any metadata
that is not explicitly specified in the request is removed from the
object's metadata.

### XML API

When working with the [XML API](https://docs.cloud.google.com/storage/docs/xml-api/overview), metadata can only be set at the
time the object is written, such as when uploading, moving, or
replacing the object. Follow instructions such as
[uploading an object](https://docs.cloud.google.com/storage/docs/uploading-objects) with the following guidelines:

- Add `-H "METADATA_KEY:METADATA_VALUE"`
  to the request header for each metadata value you are setting. For
  example, `-H "Content-Type:image/png"`.

- Prefix `x-goog-meta-` to any custom metadata values. An example of
  custom `"METADATA_KEY:METADATA_VALUE"`
  is `"x-goog-meta-dogbreed:shibainu"`.

For more information, see [Upload an Object for XML](https://docs.cloud.google.com/storage/docs/xml-api/put-object-upload).

## Update object metadata in bulk

To update metadata for millions or billions of objects with a single job,
use [Storage batch operations](https://docs.cloud.google.com/storage/docs/batch-operations/overview). To create a job, specify the
objects whose metadata you want to update, either by providing a list of
objects in a manifest file or by using object prefixes. After you have
specified the object list, [create a batch operation job to update object
metadata](https://docs.cloud.google.com/storage/docs/batch-operations/create-manage-batch-operation-jobs).

## What's next

- Learn more about [metadata associated with an object](https://docs.cloud.google.com/storage/docs/metadata).
- [Get bucket metadata](https://docs.cloud.google.com/storage/docs/getting-bucket-metadata).
- [Change an object's storage class](https://docs.cloud.google.com/storage/docs/changing-storage-classes).
- [Add a hold to an object](https://docs.cloud.google.com/storage/docs/holding-objects#use-object-holds).
- Learn how to [use request preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions) to ensure object metadata doesn't change in between requests.
