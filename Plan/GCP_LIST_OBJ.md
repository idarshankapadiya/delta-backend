This page shows you how to list objects stored in your Cloud Storage buckets.
[Objects](https://docs.cloud.google.com/storage/docs/objects) are ordered in the list lexicographically by name.

## Before you begin

To get the permissions that you need to list objects, ask your administrator
to grant you the Storage Object Viewer (`roles/storage.objectViewer`)
IAM role for the bucket that contains the objects you want to
list. If you want to list objects within [managed folders](https://docs.cloud.google.com/storage/docs/managed-folders), you can grant
`roles/storage.objectViewer` on the managed folder that contains the objects
you want to view instead of the bucket.

If you plan on using the Google Cloud console to perform the tasks on this page,
ask your administrator to grant you the Viewer (`roles/viewer`) basic role in
addition to the Storage Object Viewer (`roles/storage.objectViewer`) role.

These roles contain the permissions required to list objects. To see the exact
permissions that are required, expand the **Required permissions** section:

#### Required permissions

- `storage.objects.list`
- `storage.buckets.list`
  - This permission is only needed if you want to use the Google Cloud console to perform the tasks on this page.

You can also get these permissions with other
[predefined roles](https://docs.cloud.google.com/iam/docs/roles-permissions) or [custom roles](https://docs.cloud.google.com/iam/docs/creating-custom-roles).

For information about granting roles for buckets, see
[Set and manage IAM policies on buckets](https://docs.cloud.google.com/storage/docs/access-control/using-iam-permissions).

## List the objects in a bucket

### Console

1. In the Google Cloud console, go to the Cloud Storage **Buckets** page.

   [Go to Buckets](https://console.cloud.google.com/storage/browser)

2. In the bucket list, click the name of the bucket whose contents you
   want to view.

### Command line

Use the [`gcloud storage ls`](https://docs.cloud.google.com/sdk/gcloud/reference/storage/ls) command:

```
gcloud storage ls gs://BUCKET_NAME
```

Where:

- `BUCKET_NAME` is the name of the bucket that contains the objects you want to list. For example, `my-bucket`.

### Client libraries

### C++

For more information, see the
[Cloud Storage C++ API
reference documentation](https://docs.cloud.google.com/cpp/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample lists all objects in a bucket:

    namespace gcs = ::google::cloud::storage;
    [](gcs::Client client, std::string const& bucket_name) {
      for (auto&& object_metadata : client.ListObjects(bucket_name)) {
        if (!object_metadata) throw std::move(object_metadata).status();

        std::cout << "bucket_name=" << object_metadata->bucket()
                  << ", object_name=" << object_metadata->name() << "\n";
      }
    }

The following sample lists objects with a given prefix:

    namespace gcs = ::google::cloud::storage;
    [](gcs::Client client, std::string const& bucket_name,
       std::string const& bucket_prefix) {
      for (auto&& object_metadata :
           client.ListObjects(bucket_name, gcs::Prefix(bucket_prefix))) {
        if (!object_metadata) throw std::move(object_metadata).status();

        std::cout << "bucket_name=" << object_metadata->bucket()
                  << ", object_name=" << object_metadata->name() << "\n";
      }
    }

### C#

For more information, see the
[Cloud Storage C# API
reference documentation](https://cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample lists all objects in a bucket:

    using https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.html;
    using System;
    using System.Collections.Generic;

    public class ListFilesSample
    {
        public IEnumerable<Google.Apis.Storage.v1.Data.Object> ListFiles(
            string bucketName = "your-unique-bucket-name")
        {
            var storage = https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html#Google_Cloud_Storage_V1_StorageClient_Create();
            var storageObjects = storage.ListObjects(bucketName);
            Console.WriteLine($"Files in bucket {bucketName}:");
            foreach (var storageObject in storageObjects)
            {
                Console.WriteLine(storageObject.Name);
            }

            return storageObjects;
        }
    }

The following sample lists objects with a given prefix:

    using https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.html;
    using System;
    using System.Collections.Generic;

    public class ListFilesWithPrefixSample
    {
        /// <summary>
        /// Prefixes and delimiters can be used to emulate directory listings.
        /// Prefixes can be used to filter objects starting with prefix.
        /// The delimiter argument can be used to restrict the results to only the
        /// objects in the given "directory". Without the delimiter, the entire  tree
        /// under the prefix is returned.
        /// For example, given these objects:
        ///   a/1.txt
        ///   a/b/2.txt
        ///
        /// If you just specify prefix="a/", you'll get back:
        ///   a/1.txt
        ///   a/b/2.txt
        ///
        /// However, if you specify prefix="a/" and delimiter="/", you'll get back:
        ///   a/1.txt
        /// </summary>
        /// <param name="bucketName">The bucket to list the objects from.</param>
        /// <param name="prefix">The prefix to match. Only objects with names that start with this string will
        /// be returned. This parameter may be null or empty, in which case no filtering
        /// is performed.</param>
        /// <param name="delimiter">Used to list in "directory mode". Only objects whose names (aside from the prefix)
        /// do not contain the delimiter will be returned.</param>
        public IEnumerable<Google.Apis.Storage.v1.Data.Object> ListFilesWithPrefix(
            string bucketName = "your-unique-bucket-name",
            string prefix = "your-prefix",
            string delimiter = "your-delimiter")
        {
            var storage = https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html.https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.StorageClient.html#Google_Cloud_Storage_V1_StorageClient_Create();
            var options = new https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Storage.V1/latest/Google.Cloud.Storage.V1.ListObjectsOptions.html { Delimiter = delimiter };
            var storageObjects = storage.ListObjects(bucketName, prefix, options);
            Console.WriteLine($"Objects in bucket {bucketName} with prefix {prefix}:");
            foreach (var storageObject in storageObjects)
            {
                Console.WriteLine(storageObject.Name);
            }
            return storageObjects;
        }
    }

### Go

For more information, see the
[Cloud Storage Go API
reference documentation](https://pkg.go.dev/cloud.google.com/go/storage).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample lists all objects in a bucket:

    import (
    	"context"
    	"fmt"
    	"io"
    	"time"

    	"cloud.google.com/go/storage"
    	"google.golang.org/api/iterator"
    )

    // listFiles lists objects within specified bucket.
    func listFiles(w io.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Writer, bucket string) error {
    	// bucket := "bucket-name"
    	ctx := context.Background()
    	client, err := storage.NewClient(ctx)
    	if err != nil {
    		return fmt.Errorf("storage.NewClient: %w", err)
    	}
    	defer client.Close()

    	ctx, cancel := context.WithTimeout(ctx, time.Second*10)
    	defer cancel()

    	it := client.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Client_Bucket(bucket).https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_BucketHandle_Objects(ctx, nil)
    	for {
    		attrs, err := it.Next()
    		if err == iterator.Done {
    			break
    		}
    		if err != nil {
    			return fmt.Errorf("Bucket(%q).Objects: %w", bucket, err)
    		}
    		fmt.Fprintln(w, attrs.Name)
    	}
    	return nil
    }

The following sample lists objects with a given prefix:

    import (
    	"context"
    	"fmt"
    	"io"
    	"time"

    	"cloud.google.com/go/storage"
    	"google.golang.org/api/iterator"
    )

    // listFilesWithPrefix lists objects using prefix and delimeter.
    func listFilesWithPrefix(w io.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Writer, bucket, prefix, delim string) error {
    	// bucket := "bucket-name"
    	// prefix := "/foo"
    	// delim := "_"
    	ctx := context.Background()
    	client, err := storage.NewClient(ctx)
    	if err != nil {
    		return fmt.Errorf("storage.NewClient: %w", err)
    	}
    	defer client.Close()

    	// Prefixes and delimiters can be used to emulate directory listings.
    	// Prefixes can be used to filter objects starting with prefix.
    	// The delimiter argument can be used to restrict the results to only the
    	// objects in the given "directory". Without the delimiter, the entire tree
    	// under the prefix is returned.
    	//
    	// For example, given these blobs:
    	//   /a/1.txt
    	//   /a/b/2.txt
    	//
    	// If you just specify prefix="a/", you'll get back:
    	//   /a/1.txt
    	//   /a/b/2.txt
    	//
    	// However, if you specify prefix="a/" and delim="/", you'll get back:
    	//   /a/1.txt
    	ctx, cancel := context.WithTimeout(ctx, time.Second*10)
    	defer cancel()

    	it := client.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Client_Bucket(bucket).https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_BucketHandle_Objects(ctx, &storage.https://docs.cloud.google.com/go/docs/reference/cloud.google.com/go/storage/latest/index.html#cloud_google_com_go_storage_Query{
    		Prefix:    prefix,
    		Delimiter: delim,
    	})
    	for {
    		attrs, err := it.Next()
    		if err == iterator.Done {
    			break
    		}
    		if err != nil {
    			return fmt.Errorf("Bucket(%q).Objects(): %w", bucket, err)
    		}
    		fmt.Fprintln(w, attrs.Name)
    	}
    	return nil
    }

### Java

For more information, see the
[Cloud Storage Java API
reference documentation](https://cloud.google.com/java/docs/reference/google-cloud-storage/latest/overview).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample lists all objects in a bucket:

    import com.google.api.gax.paging.https://docs.cloud.google.com/java/docs/reference/gax/latest/com.google.api.gax.paging.Page.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html;

    public class ListObjects {
      public static void listObjects(String projectId, String bucketName) {
        // The ID of your GCP project
        // String projectId = "your-project-id";

        // The ID of your GCS bucket
        // String bucketName = "your-unique-bucket-name";

        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html storage = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html.newBuilder().setProjectId(projectId).build().https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html#com_google_cloud_storage_transfermanager_TransferManagerConfig_getService__();
        Page<Blob> blobs = storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html#com_google_cloud_storage_Storage_list_com_google_cloud_storage_Storage_BucketListOption____(bucketName);

        for (https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html blob : blobs.iterateAll()) {
          System.out.println(blob.getName());
        }
      }
    }

The following sample lists objects with a given prefix:

    import com.google.api.gax.paging.https://docs.cloud.google.com/java/docs/reference/gax/latest/com.google.api.gax.paging.Page.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html;

    public class ListObjectsWithPrefix {
      public static void listObjectsWithPrefix(
          String projectId, String bucketName, String directoryPrefix) {
        // The ID of your GCP project
        // String projectId = "your-project-id";

        // The ID of your GCS bucket
        // String bucketName = "your-unique-bucket-name";

        // The directory prefix to search for
        // String directoryPrefix = "myDirectory/"

        https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html storage = https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html.newBuilder().setProjectId(projectId).build().https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html#com_google_cloud_storage_transfermanager_TransferManagerConfig_getService__();
        /**
         * Using the Storage.BlobListOption.currentDirectory() option here causes the results to display
         * in a "directory-like" mode, showing what objects are in the directory you've specified, as
         * well as what other directories exist in that directory. For example, given these blobs:
         *
         * <p>a/1.txt a/b/2.txt a/b/3.txt
         *
         * <p>If you specify prefix = "a/" and don't use Storage.BlobListOption.currentDirectory(),
         * you'll get back:
         *
         * <p>a/1.txt a/b/2.txt a/b/3.txt
         *
         * <p>However, if you specify prefix = "a/" and do use
         * Storage.BlobListOption.currentDirectory(), you'll get back:
         *
         * <p>a/1.txt a/b/
         *
         * <p>Because a/1.txt is the only file in the a/ directory and a/b/ is a directory inside the
         * /a/ directory.
         */
        Page<Blob> blobs =
            storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html#com_google_cloud_storage_Storage_list_com_google_cloud_storage_Storage_BucketListOption____(
                bucketName,
                Storage.BlobListOption.prefix(directoryPrefix),
                Storage.BlobListOption.currentDirectory());

        for (https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html blob : blobs.iterateAll()) {
          System.out.println(blob.getName());
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

The following sample lists all objects in a bucket:

    /**
     * TODO(developer): Uncomment the following lines before running the sample.
     */
    // The ID of your GCS bucket
    // const bucketName = 'your-unique-bucket-name';

    // Imports the Google Cloud client library
    const {Storage} = require('https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/overview.html');

    // Creates a client
    const storage = new https://docs.cloud.google.com/nodejs/docs/reference/storage-control/latest/storage-control/protos.google.storage.v2.storage-class.html();

    async function listFiles() {
      // Lists files in the bucket
      const [files] = await storage.bucket(bucketName).https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/bucket.html();

      console.log('Files:');
      files.forEach(file => {
        console.log(file.name);
      });
    }

    listFiles().catch(console.error);

The following sample lists objects with a given prefix:

    /**
     * TODO(developer): Uncomment the following lines before running the sample.
     */
    // The ID of your GCS bucket
    // const bucketName = 'your-unique-bucket-name';

    // The directory prefix to search for
    // const prefix = 'myDirectory/';

    // The delimiter to use
    // const delimiter = '/';

    // Imports the Google Cloud client library
    const {Storage} = require('https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/overview.html');

    // Creates a client
    const storage = new https://docs.cloud.google.com/nodejs/docs/reference/storage-control/latest/storage-control/protos.google.storage.v2.storage-class.html();

    async function listFilesByPrefix() {
      /**
       * This can be used to list all blobs in a "folder", e.g. "public/".
       *
       * The delimiter argument can be used to restrict the results to only the
       * "files" in the given "folder". Without the delimiter, the entire tree under
       * the prefix is returned. For example, given these blobs:
       *
       *   /a/1.txt
       *   /a/b/2.txt
       *
       * If you just specify prefix = 'a/', you'll get back:
       *
       *   /a/1.txt
       *   /a/b/2.txt
       *
       * However, if you specify prefix='a/' and delimiter='/', you'll get back:
       *
       *   /a/1.txt
       */
      const options = {
        prefix: prefix,
      };

      if (delimiter) {
        options.delimiter = delimiter;
      }

      // Lists files in the bucket, filtered by a prefix
      const [files] = await storage.bucket(bucketName).https://docs.cloud.google.com/nodejs/docs/reference/storage/latest/storage/bucket.html(options);

      console.log('Files:');
      files.forEach(file => {
        console.log(file.name);
      });
    }

    listFilesByPrefix().catch(console.error);

### PHP

For more information, see the
[Cloud Storage PHP API
reference documentation](https://googleapis.github.io/google-cloud-php/#/docs/google-cloud/latest/storage/storageclient).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample lists all objects in a bucket:

    use Google\Cloud\Storage\StorageClient;

    /**
     * List Cloud Storage bucket objects.
     *
     * @param string $bucketName The name of your Cloud Storage bucket.
     *        (e.g. 'my-bucket')
     */
    function list_objects(string $bucketName): void
    {
        $storage = new StorageClient();
        $bucket = $storage->bucket($bucketName);
        foreach ($bucket->objects() as $object) {
            printf('Object: %s' . PHP_EOL, $object->name());
        }
    }

The following sample lists objects with a given prefix:

    use Google\Cloud\Storage\StorageClient;

    /**
     * List Cloud Storage bucket objects with specified prefix.
     *
     * @param string $bucketName The name of your Cloud Storage bucket.
     *        (e.g. 'my-bucket')
     * @param string $directoryPrefix the prefix to use in the list objects API call.
     *        (e.g. 'myDirectory/')
     */
    function list_objects_with_prefix(string $bucketName, string $directoryPrefix): void
    {
        $storage = new StorageClient();
        $bucket = $storage->bucket($bucketName);
        $options = ['prefix' => $directoryPrefix];
        foreach ($bucket->objects($options) as $object) {
            printf('Object: %s' . PHP_EOL, $object->name());
        }
    }

### Python

For more information, see the
[Cloud Storage Python API
reference documentation](https://cloud.google.com/python/docs/reference/storage/latest).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample lists all objects in a bucket:

    from google.cloud import https://docs.cloud.google.com/python/docs/reference/storage/latest


    def list_blobs(bucket_name):
        """Lists all the blobs in the bucket."""
        # bucket_name = "your-bucket-name"

        storage_client = https://docs.cloud.google.com/python/docs/reference/storage/latest.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html()

        # Note: Client.list_blobs requires at least package version 1.17.0.
        blobs = storage_client.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html#google_cloud_storage_client_Client_list_blobs(bucket_name)

        # Note: The call returns a response only when the iterator is consumed.
        for blob in blobs:
            print(blob.name)

The following sample lists objects with a given prefix:

    from google.cloud import https://docs.cloud.google.com/python/docs/reference/storage/latest


    def list_blobs_with_prefix(bucket_name, prefix, delimiter=None):
        """Lists all the blobs in the bucket that begin with the prefix.

        This can be used to list all blobs in a "folder", e.g. "public/".

        The delimiter argument can be used to restrict the results to only the
        "files" in the given "folder". Without the delimiter, the entire tree under
        the prefix is returned. For example, given these blobs:

            a/1.txt
            a/b/2.txt

        If you specify prefix ='a/', without a delimiter, you'll get back:

            a/1.txt
            a/b/2.txt

        However, if you specify prefix='a/' and delimiter='/', you'll get back
        only the file directly under 'a/':

            a/1.txt

        As part of the response, you'll also get back a blobs.prefixes entity
        that lists the "subfolders" under `a/`:

            a/b/


        Note: If you only want to list prefixes a/b/ and don't want to iterate over
        blobs, you can do

        ```
        for page in blobs.pages:
            print(page.prefixes)
        ```
        """

        storage_client = https://docs.cloud.google.com/python/docs/reference/storage/latest.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html()

        # Note: Client.list_blobs requires at least package version 1.17.0.
        blobs = storage_client.https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client.html#google_cloud_storage_client_Client_list_blobs(
            bucket_name, prefix=prefix, delimiter=delimiter
        )

        # Note: The call returns a response only when the iterator is consumed.
        print("Blobs:")
        for blob in blobs:
            print(blob.name)

        if delimiter:
            print("Prefixes:")
            for prefix in blobs.prefixes:
                print(prefix)

### Ruby

For more information, see the
[Cloud Storage Ruby API
reference documentation](https://googleapis.dev/ruby/google-cloud-storage/latest/Google/Cloud/Storage.html).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

The following sample lists all objects in a bucket:

    def list_files bucket_name:
      # The ID of your GCS bucket
      # bucket_name = "your-unique-bucket-name"

      require "google/cloud/storage"

      storage = Google::Cloud::https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage-control-v2/latest/Google-Cloud-Storage.html.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage.html
      bucket  = storage.bucket bucket_name

      bucket.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-Bucket.html.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-Policy-Bindings.html do |file|
        puts file.name
      end
    end

The following sample lists objects with a given prefix:

    def list_files_with_prefix bucket_name:, prefix:, delimiter: nil
      # Lists all the files in the bucket that begin with the prefix.
      #
      # This can be used to list all files in a "folder", e.g. "public/".
      #
      # The delimiter argument can be used to restrict the results to only the
      # "files" in the given "folder". Without the delimiter, the entire tree under
      # the prefix is returned. For example, given these files:
      #
      #     a/1.txt
      #     a/b/2.txt
      #
      # If you just specify `prefix: "a"`, you will get back:
      #
      #     a/1.txt
      #     a/b/2.txt
      #
      # However, if you specify `prefix: "a"` and `delimiter: "/"`, you will get back:
      #
      #     a/1.txt

      # The ID of your GCS bucket
      # bucket_name = "your-unique-bucket-name"

      # The directory prefix to search for
      # prefix = "a"

      # The delimiter to be used to restrict the results
      # delimiter = "/"

      require "google/cloud/storage"

      storage = Google::Cloud::https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage-control-v2/latest/Google-Cloud-Storage.html.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage.html
      bucket  = storage.bucket bucket_name
      files   = bucket.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-Bucket.html prefix: prefix, delimiter: delimiter

      files.https://docs.cloud.google.com/ruby/docs/reference/google-cloud-storage/latest/Google-Cloud-Storage-Policy-Bindings.html do |file|
        puts file.name
      end
    end

### Rust

The following sample lists all objects in a bucket:

    use google_cloud_gax::paginator::ItemPaginator;
    use google_cloud_storage::client::StorageControl;

    pub async fn sample(client: &StorageControl, bucket_id: &str) -> anyhow::Result<()> {
        let mut objects = client
            .list_objects()
            .set_parent(format!("projects/_/buckets/{bucket_id}"))
            .by_item();
        println!("listing objects in bucket {bucket_id}");
        while let Some(object) = objects.next().await.transpose()? {
            println!("{object:?}");
        }
        println!("DONE");
        Ok(())
    }

The following sample lists objects with a given prefix:

    use google_cloud_gax::paginator::ItemPaginator;
    use google_cloud_storage::client::StorageControl;

    pub async fn sample(client: &StorageControl, bucket_id: &str) -> anyhow::Result<()> {
        const PREFIX: &str = "prefixes/are-not-always/folders-";
        let mut objects = client
            .list_objects()
            .set_parent(format!("projects/_/buckets/{bucket_id}"))
            .set_prefix(PREFIX)
            .by_item();
        println!("listing objects in bucket {bucket_id} with prefix {PREFIX}");
        while let Some(object) = objects.next().await.transpose()? {
            println!("{object:?}");
        }
        println!("DONE");
        Ok(())
    }

<br />

### REST APIs

### JSON API

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](http://curl.haxx.se/) to call the [JSON API](https://docs.cloud.google.com/storage/docs/json_api) with a
   [request to list objects](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list):

   ```
   curl -X GET -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     "https://storage.googleapis.com/storage/v1/b/BUCKET_NAME/o"
   ```

   Where `BUCKET_NAME` is the name of the bucket
   whose objects you want to list. For example, `my-bucket`.

### XML API

1. Have gcloud CLI [installed and initialized](https://docs.cloud.google.com/sdk/docs/install), which lets
   you generate an access token for the `Authorization` header.

2. Use [`cURL`](http://curl.haxx.se/) to call the [XML API](https://docs.cloud.google.com/storage/docs/xml-api/overview) with a
   [`GET` Bucket](https://docs.cloud.google.com/storage/docs/xml-api/get-bucket-list) request:

   ```
   curl -X GET -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     "https://storage.googleapis.com/BUCKET_NAME?list-type=2"
   ```

   Where `BUCKET_NAME` is the name of the bucket
   whose objects you want to list. For example, `my-bucket`.

   You can use a `prefix=PREFIX` query string
   parameter to limit results to objects that have the specified
   prefix.

## List the objects in a folder

### Console

1. In the Google Cloud console, go to the Cloud Storage **Buckets** page.

   [Go to Buckets](https://console.cloud.google.com/storage/browser)

2. In the bucket list, click the name of the bucket that contains the
   folder.

3. In the **Objects** tab of the **Bucket details** page, click the name of
   the folder whose contents you want to view.

### Command line

Use the [`gcloud storage ls`](https://docs.cloud.google.com/sdk/gcloud/reference/storage/ls) command to list the objects in a folder:

```
gcloud storage ls gs://BUCKET_NAME/FOLDER_NAME
```

Where:

- `BUCKET_NAME` is the name of the bucket that
  contains the folder. For example, `my-bucket`.

- `FOLDER_NAME` is the name of the folder that
  contains the objects you want to list. For example, `my-folder`.

### REST APIs

### JSON API

To list the objects in a folder, use a [list objects request](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list)
with the `prefix` and `delimiter` parameters. When the `prefix`
parameter is set, the list operation is scoped to only return objects
and folders under the prefix. When the `delimiter` parameter is set,
the `prefixes[]` list in the response populates with the names of
folders under the specified prefix.

For example:

- To list all objects in the folder `image/` within the
  bucket `my-bucket`, use the following URL:
  `"https://storage.googleapis.com/storage/v1/b/my-bucket/o?prefix=image&delimiter=/"`.

  This could return the objects `my-bucket/image/cat.jpeg` and
  `my-bucket/image/dog.jpeg`.

- To include objects in subfolders within `image/`, remove the
  `delimiter` parameter:
  `"https://storage.googleapis.com/storage/v1/b/my-bucket/o?prefix=image"`.

  This could return the objects `my-bucket/image/cat.jpeg`,
  `my-bucket/image/dog.jpeg`, and `my-bucket/image/dog/shiba.jpeg`.

To use wildcards in your list objects request and match objects by
[glob expression](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list#list-objects-and-prefixes-using-glob), use the `matchGlob`
parameter. For example, `matchGlob=**.jpeg` matches all
objects that end in `.jpeg`. When you use `matchGlob`, you must set
`delimiter` to `/`.

For example, use the following URL to match all objects within the
folder `image` that end in `.jpeg`:
`"https://storage.googleapis.com/storage/v1/b/my-bucket/o?prefix=image&delimiter=/&matchGlob=**.jpeg"`

For more details about using parameters to filter for objects, see the
[Objects list JSON API reference documentation](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list).

### Use case

Using `prefix` to list the contents of a folder can be useful for
when you only have the permission to list objects in the folder, but not
the whole bucket. For example, say you have the Storage Object Viewer
(`roles/storage.objectViewer`) IAM
role for the [managed folder](https://docs.cloud.google.com/storage/docs/managed-folders) `my-bucket/my-managed-folder-a/`, but
not for the managed folder `my-bucket/my-managed-folder-b/`. To return
only the objects in `my-managed-folder-a`, you can specify
`prefix=my-managed-folder-a/`.

> [!NOTE]
> **Note:** When filtering by managed folders, set the `includeFoldersAsPrefixes` parameter to `true` and the `delimiter` parameter to `/`.

## Filtering objects

When listing objects, you can use prefixes or suffixes in your list request to
filter objects by name. To use wildcards and filter objects by
[glob expression](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list#list-objects-and-prefixes-using-glob), use the `matchGlob` parameter (or `match_glob`, depending
on the client library).

### Console

See [filtering and sorting](https://docs.cloud.google.com/storage/docs/cloud-console#sort-filter) for information on how to filter and sort
objects in buckets or folders.

### Command line

You can use [wildcards](https://docs.cloud.google.com/storage/docs/wildcards) in your [`gcloud storage ls`](https://docs.cloud.google.com/sdk/gcloud/reference/storage/ls) command to
filter objects by prefix or suffix. For example, the following command
only lists objects in the bucket `my-bucket` whose name begins with
`image` and ends with `.png`:

```
gcloud storage ls gs://my-bucket/image*.png
```

If the request is successful, the response looks similar to the following:

```
gs://my-bucket/image.png
gs://my-bucket/image-dog.png
gs://my-bucket/image-cat.png
...
```

You can use double-star wildcards to match zero or more folder levels in
a path. For example, the following command only lists objects whose name
ends in `.jpeg` in any folder or subfolder within the bucket `my-bucket`:

```
gcloud storage ls gs://my-bucket/**/*.jpeg
```

If the request is successful, the response looks similar to the following:

```
gs://my-bucket/puppy.jpeg
gs://my-bucket/pug.jpeg
gs://my-bucket/pets/dog.jpeg
...
```

### REST APIs

See [list objects in folders](https://docs.cloud.google.com/storage/docs/listing-objects#list-objects-in-folder) for information on how to filter objects
by folder or object name prefix.

### Filter objects by contexts

You can use a filter to display only objects that match the specified [contexts](https://docs.cloud.google.com/storage/docs/object-contexts) when you list objects.

### Command line

Use the [`gcloud storage objects list`](https://docs.cloud.google.com/sdk/gcloud/reference/storage/objects/list) command:

```
gcloud storage objects list gs://BUCKET_NAME --metadata-filter='contexts."KEY"="VALUE"'
```

Where:

- `BUCKET_NAME` is the name of the bucket that contains the object you want to filter by context. For example, `my-bucket`.
- `KEY` is the context key attached to the object.
- `VALUE` is the value associated with the context key.

If successful, the response looks similar to the following example:

```
---
bucket: my-bucket
contexts:
  Department:
    createTime: '2023-01-01T00:00:00.000000+00:00'
    type: CUSTOM
    updateTime: '2023-01-01T00:00:00.000000+00:00'
    value: HR
  DataClassification:
    createTime: '2023-01-01T00:00:00.000000+00:00'
    type: CUSTOM
    updateTime: '2023-01-01T00:00:00.000000+00:00'
    value: Confidential
name: employees.txt
...
```

The following command lists objects that have the specified context key,
regardless of its value:

```
gcloud storage objects list gs://BUCKET_NAME --metadata-filter='contexts."KEY":*'
```

To limit the output to display only the context keys and values, use
`--format=contextsonly`:

```
gcloud storage objects list gs://BUCKET_NAME --metadata-filter='contexts."KEY":*' --format=contextsonly
```

If successful, the response looks similar to the following example:

```
---
Department: HR
DataClassification: Confidential
```

### Client libraries

### Java

For more information, see the
[Cloud Storage Java API
reference documentation](https://cloud.google.com/java/docs/reference/google-cloud-storage/latest/overview).

To authenticate to Cloud Storage, set up Application Default Credentials.
For more information, see

[Set up authentication for client libraries](https://docs.cloud.google.com/storage/docs/authentication#client-libs).

    import com.google.api.gax.paging.https://docs.cloud.google.com/java/docs/reference/gax/latest/com.google.api.gax.paging.Page.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html;
    import com.google.cloud.storage.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html;

    public class ListObjectContexts {
      public static void listObjectContexts(String projectId, String bucketName, String key)
          throws Exception {
        // The ID of your GCP project
        // String projectId = "your-project-id";

        // The ID of your GCS bucket
        // String bucketName = "your-unique-bucket-name";

        // The context key you want to filter
        // String key = "your-context-key";

        try (https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html storage =
            https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.StorageOptions.html.newBuilder().setProjectId(projectId).build().https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.transfermanager.TransferManagerConfig.html#com_google_cloud_storage_transfermanager_TransferManagerConfig_getService__()) {
          /*
           * List any object that has a context with the specified key attached
           * String filter = "contexts.\"KEY\":*";
           *
           * List any object that that does not have a context with the specified key attached
           * String filter = "NOT contexts.\"KEY\":*";
           *
           * List any object that has a context with the specified key and value attached
           * String filter = "contexts.\"KEY\"=\"VALUE\"";
           *
           * List any object that does not have a context with the specified key and value attached
           * String filter = "NOT contexts.\"KEY\"=\"VALUE\"";
           */

          String filter = "contexts.\"" + key + "\":*";

          System.out.println("Listing objects for bucket: " + bucketName + "with context key: " + key);
          Page<Blob> blobs = storage.list(bucketName, https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.html.BlobListOption.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Storage.BlobListOption.html#com_google_cloud_storage_Storage_BlobListOption_filter_java_lang_String_(filter));
          for (https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.Blob.html blob : blobs.iterateAll()) {
            System.out.println(blob.https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobInfo.html#com_google_cloud_storage_BlobInfo_getBlobId__().https://docs.cloud.google.com/java/docs/reference/google-cloud-storage/latest/com.google.cloud.storage.BlobId.html#com_google_cloud_storage_BlobId_toGsUtilUri__());
          }
        }
      }
    }

### Rust

    use google_cloud_gax::paginator::ItemPaginator;
    use google_cloud_storage::client::StorageControl;

    pub async fn sample(client: &StorageControl, bucket_id: &str) -> anyhow::Result<()> {
        let mut objects = client
            .list_objects()
            .set_parent(format!("projects/_/buckets/{bucket_id}"))
            .set_filter("contexts.\"example\":*")
            .by_item();
        println!("listing objects in bucket {bucket_id} with an context named `example`");
        while let Some(object) = objects.next().await.transpose()? {
            println!("{object:?}");
        }
        println!("done");
        Ok(())
    }

<br />

### REST APIs

### JSON API

The [`Object: list`](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list) request shows an example of how to use the `filter` query parameter to filter objects by context.

The following example filters by key-value pair:

```
curl -X GET \
-H "Authorization: Bearer $(gcloud auth print-access-token)" \
"https://storage.googleapis.com/storage/v1/b/BUCKET_NAME/o/?filter=contexts.%22KEY%22%3D%22VALUE%22"
```

Where:

- `BUCKET_NAME` is the name of the bucket containing the object whose context you want to filter by. For example, `my-bucket`.
- `KEY` is the context key attached to the object.
- `VALUE` is the value associated with the context key.

#### Syntax

Cloud Storage supports the following syntax for the filter.

| Syntax                                                      | Description                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `contexts."KEY":*`                                          | Match any object that has a context with the specified key attached.                     |
| `contexts."KEY"="VALUE"`                                    | Match any object that has a context with the specified key and value attached.           |
| `NOT contexts."KEY":*` _OR_ `-contexts."KEY":*`             | Match any object that does not have a context with the specified key attached.           |
| `NOT contexts."KEY"="VALUE"` _OR_ `-contexts."KEY"="VALUE"` | Match any object that does not have a context with the specified key and value attached. |

## Performance considerations when listing objects

The underlying structure of buckets with [hierarchical namespace](https://docs.cloud.google.com/storage/docs/hns-overview) enabled
influences the performance of the listing objects operation, when compared to
flat namespace buckets. For more information, see
[Optimize performance in buckets with hierarchical namespace enabled](https://docs.cloud.google.com/storage/docs/hns-buckets-best-practices#listing-objects).

## What's next

- [Download an object from your bucket](https://docs.cloud.google.com/storage/docs/downloading-objects).
- [View and edit object metadata](https://docs.cloud.google.com/storage/docs/viewing-editing-metadata).
- [Delete objects from your bucket](https://docs.cloud.google.com/storage/docs/deleting-objects).
- Learn how to [paginate results](https://docs.cloud.google.com/storage/docs/paginate-results).
